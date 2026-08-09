"""Pharmacy/delivery marketplace matching engine (Stages 2-7 of the marketplace spec).

broadcast_order(), pharmacy_accept_item(), pharmacy_decline_item(), broadcast_delivery(),
delivery_agent_accept(), update_agent_location(), collect_cash(), and mark_delivered() are
internal functions with no logic of their own baked into views.py — Stage 5's pharmacy views call
the pharmacy functions directly, Stage 6's delivery views call the delivery functions directly.
The only pieces of this module that aren't called straight through from a thin view wrapper are
sync_order_status() (called reactively by the functions above), _create_settlement_records()
(called from sync_order_status()'s PLACED -> DELIVERED transition, not exposed as its own view),
and the admin/cron-callable expiry endpoint, which calls expire_stale_fulfillment_requests() and
expire_stale_delivery_broadcasts().

sync_order_status() is the single source of truth for Order.status transitions and is called
reactively at the end of every function above that can change whether an order's items/deliveries
are resolved — see its own docstring for the transition table.

calculate_agent_payout() and _create_settlement_records() import _get_setting from .views inside
the function body rather than at module level — views.py already imports from this module at
import time, so a top-level `from .views import _get_setting` here would be a circular import.
"""
import math
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Value, FloatField, ExpressionWrapper
from django.db.models.functions import Radians, Sin, Cos, ASin, Sqrt, Power
from django.utils import timezone

from .models import (
    Pharmacy, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, OrderItem, Order, Cart, Notification,
    DeliveryAgent, PharmacyPayout, DeliveryAgentEarning, DeliveryAgentCodLiability,
)

BROADCAST_RADIUS_KM = 3
BROADCAST_WINDOW_MINUTES = 10
# How long a pharmacy that can fulfill EVERY item in an order gets first dibs before the order
# falls back to broadcast_order()'s old per-item behavior (broadcasting to every eligible pharmacy
# regardless of whether they cover the whole order) — see widen_stale_priority_broadcasts().
# Deliberately much shorter than BROADCAST_WINDOW_MINUTES: this is a head start, not the whole
# window an item can sit unanswered before it's unfulfillable.
PRIORITY_WINDOW_MINUTES = 2
EARTH_RADIUS_KM = 6371.0


def _annotate_distance_km(queryset, lat, lng, lat_field='lat', lng_field='lng'):
    """Annotates `queryset` with `distance_km` from (lat, lng) using the haversine formula,
    computed entirely as a DB-side expression (Django's math functions, no PostGIS)."""
    lat1 = Radians(Value(float(lat), output_field=FloatField()))
    lat2 = Radians(F(lat_field))
    lng1 = Radians(Value(float(lng), output_field=FloatField()))
    lng2 = Radians(F(lng_field))
    half = Value(0.5, output_field=FloatField())
    two = Value(2.0, output_field=FloatField())

    a = Power(Sin((lat2 - lat1) * half), two) + Cos(lat1) * Cos(lat2) * Power(Sin((lng2 - lng1) * half), two)
    c = ASin(Sqrt(a)) * two
    radius = Value(EARTH_RADIUS_KM, output_field=FloatField())

    return queryset.annotate(distance_km=ExpressionWrapper(c * radius, output_field=FloatField()))


def _haversine_km(lat1, lng1, lat2, lng2):
    """Plain-Python great-circle distance between two points, in km — same haversine formula and
    EARTH_RADIUS_KM as _annotate_distance_km() above, but as a normal function rather than a
    queryset annotation: for the one-rider-to-one-address distance in _tracking_payload(), not
    for filtering/ranking many rows."""
    lat1, lng1, lat2, lng2 = (math.radians(v) for v in (lat1, lng1, lat2, lng2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def _eligible_pharmacies_for_item(item, address):
    """PharmacyMedicineListings within BROADCAST_RADIUS_KM of `address` that can cover `item`:
    verified + active pharmacy, listing available, enough stock, not expired. Shared by
    broadcast_order() and widen_stale_priority_broadcasts() so both use the exact same
    eligibility rule."""
    nearby_pharmacies = _annotate_distance_km(
        Pharmacy.objects.filter(is_verified=True, is_active=True),
        address.lat, address.lng,
    ).filter(distance_km__lte=BROADCAST_RADIUS_KM)

    return PharmacyMedicineListing.objects.filter(
        pharmacy__in=nearby_pharmacies,
        medicine=item.medicine,
        is_available=True,
        stock_quantity__gte=item.quantity,
        expiry_date__gt=timezone.now().date(),
    ).select_related('pharmacy')


def _create_requests_for_item(item, listings):
    """Creates a FulfillmentRequest (and notifies the pharmacy) for every listing not already
    requested for this item. get_or_create makes this safe to call more than once for the same
    item — a re-broadcast, or widen_stale_priority_broadcasts() topping up the pool later, only
    ever adds the gap, never duplicates or disturbs an existing PENDING/ACCEPTED/etc. request.
    Returns True if `item` ended up with at least one request (existing or newly created)."""
    created_any = False
    for listing in listings:
        _req, req_created = FulfillmentRequest.objects.get_or_create(order_item=item, pharmacy=listing.pharmacy)
        if req_created:
            Notification.objects.create(
                user=listing.pharmacy.user, type='NEW_FULFILLMENT_REQUEST', title='New Order Request',
                message=f'A nearby customer needs {item.medicine.name} × {item.quantity}.',
                link='/pharmacy/requests',
            )
        created_any = True
    return created_any


def broadcast_order(order):
    """For every OrderItem in the order, find pharmacies within BROADCAST_RADIUS_KM that list
    that medicine, with sufficient stock, verified + active, and create a FulfillmentRequest for
    each. Returns {'broadcast': [order_item_id, ...], 'unfulfillable': [order_item_id, ...]}.

    There's no persisted "unfulfillable" flag on OrderItem — Stage 1 deliberately didn't add one.
    An item with zero FulfillmentRequest rows (and no `fulfillment` set) IS the unfulfillable
    state; this return value is just a convenience summary for the caller.

    Full-coverage priority: if some pharmacy can fulfill EVERY item in this order, only that
    pharmacy (or set of pharmacies) gets broadcast to at first — otherwise a multi-item order
    routinely splits across pharmacies purely because whichever pharmacy happens to accept first
    per item wins, even when one nearby pharmacy could have covered the whole thing (real order
    observed: a pharmacy stocking all 3 items still lost 2 of them to a pharmacy that only had
    those 2, because both were broadcast the per-item request simultaneously). Falls straight
    through to broadcasting everyone immediately — no staging, no delay — for a single-item order,
    for an order where the full-coverage pool and "everyone eligible" pool are the same anyway, or
    (the case that matters most) when NO pharmacy covers every item: an empty full-coverage pool
    can never become non-empty by waiting, so there's nothing to gain from a delay there.
    widen_stale_priority_broadcasts() is what promotes a genuinely-staged order to the full pool
    once PRIORITY_WINDOW_MINUTES passes with no full-coverage acceptance.
    """
    result = {'broadcast': [], 'unfulfillable': []}
    address = order.address

    if address is None or address.lat is None or address.lng is None:
        for item in order.items.all():
            result['unfulfillable'].append(item.id)
        sync_order_status(order)
        return result

    items = list(order.items.select_related('medicine'))
    listings_by_item = {item.id: list(_eligible_pharmacies_for_item(item, address)) for item in items}
    ids_by_item = {item_id: {l.pharmacy_id for l in listings} for item_id, listings in listings_by_item.items()}

    full_coverage_ids = set.intersection(*ids_by_item.values()) if ids_by_item else set()
    all_eligible_ids = set().union(*ids_by_item.values()) if ids_by_item else set()
    stage_priority = len(items) > 1 and bool(full_coverage_ids) and full_coverage_ids < all_eligible_ids

    for item in items:
        listings = listings_by_item[item.id]
        if stage_priority:
            listings = [l for l in listings if l.pharmacy_id in full_coverage_ids]
        created_any = _create_requests_for_item(item, listings)
        result['broadcast' if created_any else 'unfulfillable'].append(item.id)

    # covers the edge case where every item had zero eligible pharmacies from the start —
    # there's nothing PENDING to wait on, so the order is already "resolved" right now.
    sync_order_status(order)
    return result


def widen_stale_priority_broadcasts():
    """Opportunistic top-up sweep for the full-coverage priority stage above — there's no real
    task scheduler anywhere in this project (the existing "admin/cron-callable"
    AdminExpireFulfillmentRequestsView, calling expire_stale_fulfillment_requests() below, is
    never actually invoked from anywhere, including its own admin UI — a pre-existing gap, not one
    introduced here), so this is instead called opportunistically from endpoints that are already
    polled every few seconds in practice (PharmacyRequestListView, OrderFulfillmentSummaryView).
    Known limitation: if literally nobody has a relevant page open, an order can sit in its
    priority-only stage past PRIORITY_WINDOW_MINUTES until someone does — no worse than the
    pre-existing (also-orphaned) expiry mechanism this mirrors.

    For every still-unresolved OrderItem (no fulfillment yet) on a still-BROADCASTING order whose
    oldest PENDING request has aged past the window, (re-)broadcasts to that item's FULL eligible
    pool — not just whatever full-coverage-only pool broadcast_order() may have started with.
    _create_requests_for_item()'s get_or_create makes this idempotent: pharmacies already in the
    pool are untouched, only the gap (partial-coverage pharmacies) gets added.
    """
    cutoff = timezone.now() - timedelta(minutes=PRIORITY_WINDOW_MINUTES)
    stale_item_ids = FulfillmentRequest.objects.filter(
        status='PENDING', created_at__lt=cutoff,
    ).values_list('order_item_id', flat=True).distinct()

    items = OrderItem.objects.filter(
        id__in=stale_item_ids, fulfillment__isnull=True, order__status='BROADCASTING',
    ).select_related('order__address', 'medicine')

    widened_item_ids = []
    for item in items:
        address = item.order.address
        if address is None or address.lat is None or address.lng is None:
            continue
        listings = _eligible_pharmacies_for_item(item, address)
        if _create_requests_for_item(item, listings):
            widened_item_ids.append(item.id)
    return widened_item_ids


@transaction.atomic
def pharmacy_accept_item(pharmacy, order_item):
    """First-accept-wins.

    NOTE on the row lock, deviating from the spec's literal pseudocode: the spec's sample code
    calls `select_for_update()` on the FulfillmentRequest row for (order_item, pharmacy) — but
    that's a different row per pharmacy, so two pharmacies racing on the same order_item each lock
    their OWN row and never block each other; both could pass the "has anyone else accepted?"
    check before either commits. The lock has to be on something the two competing transactions
    actually share: here, the OrderItem row itself. Locking `order_item` and using
    `order_item.fulfillment_id` (set exactly once, on the winning accept) as the "already taken"
    check is what makes this genuinely race-safe under concurrent callers.
    """
    item = OrderItem.objects.select_for_update().get(pk=order_item.pk)

    try:
        req = FulfillmentRequest.objects.get(order_item=item, pharmacy=pharmacy)
    except FulfillmentRequest.DoesNotExist:
        return False, 'No fulfillment request found for this pharmacy and item.'

    if req.status != 'PENDING':
        return False, 'This request is no longer available.'

    if item.fulfillment_id is not None:
        req.status = 'EXPIRED'
        req.save(update_fields=['status'])
        return False, 'Another pharmacy already accepted this item.'

    req.status = 'ACCEPTED'
    req.responded_at = timezone.now()
    req.save(update_fields=['status', 'responded_at'])

    FulfillmentRequest.objects.filter(order_item=item, status='PENDING').exclude(pharmacy=pharmacy).update(status='EXPIRED')

    fulfillment, created = OrderFulfillment.objects.get_or_create(
        order=item.order, pharmacy=pharmacy,
        defaults={'status': 'ACCEPTED', 'accepted_at': timezone.now()},
    )
    just_accepted = created
    if not created and fulfillment.status == 'BROADCASTING':
        fulfillment.status = 'ACCEPTED'
        fulfillment.accepted_at = timezone.now()
        fulfillment.save(update_fields=['status', 'accepted_at'])
        just_accepted = True

    item.fulfillment = fulfillment
    item.save(update_fields=['fulfillment'])

    if just_accepted:
        # one notification per pharmacy-leg, not per item — a pharmacy accepting 3 items off the
        # same order reuses the same OrderFulfillment row (see get_or_create above), so this only
        # fires once per (order, pharmacy) pair, the moment they start preparing it.
        from .views import _notify_admins
        _notify_admins(
            'manage_orders', 'FULFILLMENT_UPDATE', 'Pharmacy Preparing Order',
            f'{pharmacy.name} accepted order #{str(item.order_id)[:8]} and is preparing it.',
            link=f'/admin/orders/{item.order_id}',
        )

    PharmacyMedicineListing.objects.filter(pharmacy=pharmacy, medicine=item.medicine).update(
        stock_quantity=F('stock_quantity') - item.quantity
    )

    sync_order_status(item.order)
    return True, None


def pharmacy_decline_item(pharmacy, order_item):
    """Marks this pharmacy's FulfillmentRequest as DECLINED. Doesn't touch other pharmacies'
    pending requests for the same item — declining is purely a per-pharmacy action.

    No select_for_update needed here: the single conditional UPDATE (WHERE status='PENDING') is
    already atomic — there's no read-then-branch-then-write gap to race on, unlike accept.
    """
    updated = FulfillmentRequest.objects.filter(
        order_item=order_item, pharmacy=pharmacy, status='PENDING',
    ).update(status='DECLINED', responded_at=timezone.now())
    if not updated:
        return False, 'This request is no longer available.'
    sync_order_status(order_item.order)
    return True, None


# The pharmacy-controlled prep stages a fulfillment walks through before it's handed off to a
# rider. Each pharmacy click just moves it one step; ACCEPTED and AWAITING_DELIVERY already exist
# for other reasons (see OrderFulfillment.STATUS), this is only the sequencing between them.
FULFILLMENT_PREP_SEQUENCE = ['ACCEPTED', 'PREPARED', 'PACKED', 'AWAITING_DELIVERY']


def pharmacy_advance_fulfillment(pharmacy, fulfillment):
    """Manually advances one fulfillment one step through ACCEPTED -> PREPARED -> PACKED ->
    AWAITING_DELIVERY (broadcast to nearby riders) — replaces the old behavior where the last
    step happened automatically and instantly the moment the order was paid, regardless of
    whether the pharmacy had actually finished preparing anything yet.

    Requires the parent Order to already be PLACED (payment confirmed / COD chosen) before ANY
    step is allowed, not just the final rider-handoff — accepting a request commits the
    pharmacy's stock and gets the order to AWAITING_PAYMENT, but actually preparing/packing real
    stock for an order the customer hasn't committed to paying for yet is exactly the wasted
    effort this guard exists to prevent.
    """
    if fulfillment.pharmacy_id != pharmacy.id:
        return False, 'This order does not belong to your pharmacy.'

    if fulfillment.order.status != 'PLACED':
        return False, "Waiting for the customer's payment to be confirmed before this order can be prepared."

    current = fulfillment.status
    if current not in FULFILLMENT_PREP_SEQUENCE[:-1]:
        return False, f'Cannot advance a fulfillment from its current status ({current}).'

    next_status = FULFILLMENT_PREP_SEQUENCE[FULFILLMENT_PREP_SEQUENCE.index(current) + 1]

    if next_status == 'AWAITING_DELIVERY':
        fulfillment.status = next_status
        fulfillment.save(update_fields=['status'])
        # Doesn't broadcast to riders on its own — see _maybe_broadcast_delivery_for_order()'s
        # docstring for why a split order waits on every pharmacy leg before any of them go out.
        _maybe_broadcast_delivery_for_order(fulfillment.order)
        return True, None

    fulfillment.status = next_status
    fulfillment.save(update_fields=['status'])

    if next_status == 'PREPARED':
        # The customer's only signal so far was "Order Placed" at payment time — this is the
        # first confirmation that a real pharmacy is actually acting on it, not just that the
        # payment cleared.
        pharmacy_name = fulfillment.pharmacy.name if fulfillment.pharmacy else 'The pharmacy'
        Notification.objects.create(
            user=fulfillment.order.user, type='ORDER_UPDATE', title='Order Confirmed',
            message=f'{pharmacy_name} confirmed order #{str(fulfillment.order_id)[:8]} and is preparing it.',
            link=f'/orders/{fulfillment.order_id}',
        )

    return True, None


@transaction.atomic
def expire_stale_fulfillment_requests():
    """Expires every still-PENDING FulfillmentRequest older than BROADCAST_WINDOW_MINUTES.
    Returns (expired_count, unfulfillable_item_ids) — an item is unfulfillable if none of its
    requests were accepted before they expired (i.e. `fulfillment` is still unset)."""
    cutoff = timezone.now() - timedelta(minutes=BROADCAST_WINDOW_MINUTES)
    stale = FulfillmentRequest.objects.filter(status='PENDING', created_at__lt=cutoff)
    stale_item_ids = list(stale.values_list('order_item_id', flat=True).distinct())
    expired_count = stale.update(status='EXPIRED', responded_at=timezone.now())

    unfulfillable_item_ids = list(
        OrderItem.objects.filter(id__in=stale_item_ids, fulfillment__isnull=True).values_list('id', flat=True)
    )

    affected_order_ids = OrderItem.objects.filter(id__in=stale_item_ids).values_list('order_id', flat=True).distinct()
    for order in Order.objects.filter(id__in=list(affected_order_ids)):
        sync_order_status(order)

    return expired_count, unfulfillable_item_ids


def _maybe_broadcast_delivery_for_order(order):
    """Gates broadcast_delivery() so a split order across N pharmacies only ever goes out as ONE
    combined pickup job for a single rider, not N independent broadcasts that different riders
    could pick off piecemeal (the exact bug that prompted this: a real 3-item order split across
    two pharmacies, and the first one to finish packing would previously have been broadcast to
    riders immediately, on its own, regardless of whether the other pharmacy had even started).

    Looks at every non-CANCELLED OrderFulfillment on the order. If any hasn't independently
    reached AWAITING_DELIVERY yet, does nothing — a fulfillment that gets there first just sits
    with its status set but delivery_broadcast_at still None (so
    expire_stale_delivery_broadcasts(), which only compares delivery_broadcast_at, correctly never
    flags it as a stale broadcast — nothing has actually been broadcast yet). Once every leg is
    ready, broadcasts all of them.

    KNOWN GAP, accepted for now, not an oversight: if no single delivery agent is ever verified,
    online, AND within BROADCAST_RADIUS_KM of EVERY pharmacy in the set (see
    _agent_eligible_for()'s docstring for why that's the right bar), this combined job can sit
    AWAITING_DELIVERY indefinitely with nobody ever eligible to accept it — there is currently no
    fallback that re-splits it back into independently-broadcast legs.
    expire_stale_delivery_broadcasts() only REPORTS a stale broadcast for admin follow-up, it
    doesn't recover one. Expected to be rare in practice (pharmacies both within
    BROADCAST_RADIUS_KM of the same customer are usually reasonably close to each other too), but
    a real limitation worth remembering if delivery pickups start silently stalling.
    """
    fulfillments = list(order.fulfillments.exclude(status='CANCELLED'))
    if not fulfillments or any(f.status != 'AWAITING_DELIVERY' for f in fulfillments):
        return
    for f in fulfillments:
        if f.delivery_broadcast_at is None:
            broadcast_delivery(f)


def broadcast_delivery(fulfillment):
    """Marks one OrderFulfillment (already AWAITING_DELIVERY — see
    _maybe_broadcast_delivery_for_order(), the only caller) as actually broadcast, and notifies
    every currently-eligible DeliveryAgent (_agent_eligible_for() — verified, online, and within
    BROADCAST_RADIUS_KM of every pharmacy on this fulfillment's order, not just this one leg's).

    Unlike broadcast_order()/FulfillmentRequest, there's no per-agent request row: any eligible
    agent can call delivery_agent_accept() at any time while status stays AWAITING_DELIVERY —
    eligibility is re-checked live at accept time instead of being frozen at broadcast time.
    Called once per leg on a split order (so a 2-pharmacy order fires this twice) — each pharmacy
    still gets its own "ready for pickup" admin notification either way, which is the simpler
    option explicitly allowed over a single merged notification. Returns the list of notified
    DeliveryAgent ids.
    """
    fulfillment.delivery_broadcast_at = timezone.now()
    fulfillment.save(update_fields=['delivery_broadcast_at'])

    pharmacy = fulfillment.pharmacy
    if pharmacy is not None:
        from .views import _notify_admins
        _notify_admins(
            'manage_orders', 'FULFILLMENT_UPDATE', 'Order Ready for Pickup',
            f'{pharmacy.name} has order #{str(fulfillment.order_id)[:8]} packed and ready for a rider.',
            link=f'/admin/orders/{fulfillment.order_id}',
        )
    if pharmacy is None or pharmacy.lat is None or pharmacy.lng is None:
        return []

    # Python-side filter through _agent_eligible_for() rather than a single DB-side proximity
    # query (as this used to be) — the eligibility rule is no longer "near this one pharmacy", it
    # depends on every pharmacy on the order, so there's one source of truth for it (also used by
    # DeliveryRequestListView and delivery_agent_accept()) instead of duplicating the logic here.
    candidate_agents = DeliveryAgent.objects.filter(is_verified=True, is_online=True).select_related('user')
    eligible_agents = [a for a in candidate_agents if _agent_eligible_for(a, fulfillment)]

    notified_ids = []
    notifications = []
    for agent in eligible_agents:
        notifications.append(Notification(
            user=agent.user, type='DELIVERY_REQUEST', title='New Delivery Available',
            message=f'A delivery pickup is available near you at {pharmacy.name}.',
            link='/delivery/requests',
        ))
        notified_ids.append(agent.id)
    if notifications:
        Notification.objects.bulk_create(notifications)

    return notified_ids


def _agent_eligible_for(agent, fulfillment):
    """The live eligibility gate delivery_agent_accept() uses in place of a frozen request row:
    verified, online, and currently within range of EVERY pharmacy on this fulfillment's order —
    not just this one leg's pharmacy. A split order is bundled into one combined pickup job (see
    _maybe_broadcast_delivery_for_order()), so an agent only qualifies if they're realistically
    positioned for the WHOLE route, not just its nearest stop: two pharmacies can each
    independently be up to BROADCAST_RADIUS_KM from the same customer address while being up to
    2 × BROADCAST_RADIUS_KM from each other, so "near just one of them" could hand a rider a
    combined trip that's actually more total travel than splitting the legs across two separate
    riders would have been — defeating the entire point of bundling. For a single-pharmacy
    fulfillment this is exactly the original one-pharmacy check, unchanged.
    """
    if not (agent.is_verified and agent.is_online):
        return False
    if agent.lat is None or agent.lng is None:
        return False
    pharmacies = [f.pharmacy for f in fulfillment.order.fulfillments.exclude(status='CANCELLED') if f.pharmacy_id]
    if not pharmacies:
        return False
    for pharmacy in pharmacies:
        if pharmacy.lat is None or pharmacy.lng is None:
            return False
        qs = _annotate_distance_km(DeliveryAgent.objects.filter(pk=agent.pk), pharmacy.lat, pharmacy.lng)
        if not qs.filter(distance_km__lte=BROADCAST_RADIUS_KM).exists():
            return False
    return True


@transaction.atomic
def delivery_agent_accept(agent, fulfillment):
    """First-accept-wins, same pattern as pharmacy_accept_item(): locks every non-CANCELLED
    OrderFulfillment on the SAME order (not just the one the rider clicked), ordered by `id` for
    consistent lock ordering — avoids deadlocking against another rider racing a different leg of
    the same split order — so accepting one leg atomically assigns every leg on the order to this
    one agent. One rider covers the whole order, never just the fulfillment they happened to
    click; see _maybe_broadcast_delivery_for_order() for why every leg is guaranteed to already be
    AWAITING_DELIVERY together by the time any of them is broadcast, and _agent_eligible_for() for
    why eligibility requires proximity to every pharmacy in the set, not just one.
    """
    fulfillment_ids = list(
        OrderFulfillment.objects.filter(order_id=fulfillment.order_id).exclude(status='CANCELLED')
        .order_by('id').values_list('id', flat=True)
    )
    fulfillments = list(
        OrderFulfillment.objects.select_for_update().filter(id__in=fulfillment_ids).order_by('id')
    )

    # delivery_broadcast_at, not just status: a leg reaches AWAITING_DELIVERY the moment its OWN
    # pharmacy finishes packing, but isn't actually broadcast (and shouldn't be acceptable) until
    # _maybe_broadcast_delivery_for_order() confirms every sibling leg is ready too — same reason
    # DeliveryRequestListView filters on both fields, not just status.
    if not fulfillments or any(f.status != 'AWAITING_DELIVERY' or f.delivery_broadcast_at is None for f in fulfillments):
        return False, 'This delivery is no longer available.'

    if not _agent_eligible_for(agent, fulfillments[0]):
        return False, 'You are not eligible to accept this delivery (must be verified, online, and near every pharmacy in this pickup).'

    for f in fulfillments:
        f.delivery_agent = agent
        f.status = 'OUT_FOR_DELIVERY'
        f.save(update_fields=['delivery_agent', 'status'])

    from .views import _notify_admins
    pharmacy_names = ', '.join(f.pharmacy.name for f in fulfillments if f.pharmacy_id) or 'the pharmacy'
    _notify_admins(
        'manage_orders', 'FULFILLMENT_UPDATE', 'Rider Picked Up Order',
        f'{agent.user.full_name} picked up order #{str(fulfillments[0].order_id)[:8]} from {pharmacy_names}.',
        link=f'/admin/orders/{fulfillments[0].order_id}',
    )

    # Customer and pharmacy both need per-order awareness of this — deliberately no admin
    # per-delivery notification here (that's the _notify_admins call above, which is the intended
    # admin-facing signal); see pharmax-rider-tracking-spec.md Part 1. One customer notification
    # for the whole order, but one per pharmacy — each pharmacy needs its own "your leg was picked
    # up" ping regardless of how many other legs are on the same order.
    Notification.objects.create(
        user=fulfillments[0].order.user, type='ORDER_UPDATE', title='Order Out for Delivery',
        message=f'{agent.user.full_name} is on the way with order #{str(fulfillments[0].order_id)[:8]}.',
        link=f'/orders/{fulfillments[0].order_id}',
    )
    for f in fulfillments:
        if f.pharmacy_id:
            Notification.objects.create(
                user=f.pharmacy.user, type='ORDER_UPDATE', title='Rider Picked Up',
                message=f'{agent.user.full_name} picked up order #{str(f.order_id)[:8]}.',
                link='/pharmacy/orders',
            )

    return True, None


def update_agent_location(agent, lat, lng):
    """No websockets yet — a simple field update, meant to be called on an interval from the
    rider's side (Stage 6)."""
    agent.lat = lat
    agent.lng = lng
    agent.save(update_fields=['lat', 'lng'])


def _tracking_payload(fulfillment):
    """Shared shape returned by all three tracking endpoints below. Agent location/distance/ETA
    only make sense once a rider is actually en route — before that (or after DELIVERED) `agent`
    is just null, not stale coordinates from whenever they last updated their location."""
    agent = fulfillment.delivery_agent
    data = {
        'fulfillment_id': str(fulfillment.id),
        'status': fulfillment.status,
        'pharmacy_name': fulfillment.pharmacy.name if fulfillment.pharmacy else None,
    }
    if agent and fulfillment.status == 'OUT_FOR_DELIVERY':
        data['agent'] = {
            'name': agent.user.full_name, 'phone': agent.phone,
            'lat': agent.lat, 'lng': agent.lng,
        }
        address = fulfillment.order.address
        if agent.lat is not None and agent.lng is not None and address is not None and address.lat is not None and address.lng is not None:
            distance_km = _haversine_km(agent.lat, agent.lng, address.lat, address.lng)
            data['distance_km'] = round(distance_km, 1)
            data['eta_minutes'] = round((distance_km / 20) * 60)  # rough estimate, 20km/h assumed
    else:
        data['agent'] = None
    return data


def _deliver_fulfillment(fulfillment):
    """Shared mechanics for marking one fulfillment DELIVERED — used by both collect_cash() and
    mark_delivered(), since flipping the status, stamping delivered_at, and rolling the order up
    doesn't actually depend on payment method; only the validation in front of it does. The single
    conditional UPDATE (WHERE status='OUT_FOR_DELIVERY') is already atomic — no lock needed, since
    only the one rider already assigned to this fulfillment would ever call this, unlike accept()."""
    updated = OrderFulfillment.objects.filter(pk=fulfillment.pk, status='OUT_FOR_DELIVERY').update(
        status='DELIVERED', delivered_at=timezone.now(),
    )
    if not updated:
        return False, 'This delivery is not out for delivery.'
    fulfillment.refresh_from_db()

    from .views import _notify_admins
    pharmacy_name = fulfillment.pharmacy.name if fulfillment.pharmacy else 'the pharmacy'
    _notify_admins(
        'manage_orders', 'FULFILLMENT_UPDATE', 'Fulfillment Delivered',
        f'Order #{str(fulfillment.order_id)[:8]} — the {pharmacy_name} leg has been delivered.',
        link=f'/admin/orders/{fulfillment.order_id}',
    )

    # Pharmacy notification is correctly per-leg — shared by collect_cash() and mark_delivered(),
    # fires once per fulfillment regardless of which path completed it. NOT mirrored for the
    # customer here on purpose: for a split order across multiple pharmacies, this function fires
    # once per leg, but the customer only cares about the whole order — sync_order_status()
    # already owns that single "Order Delivered" notification, firing exactly once, only once
    # every fulfillment (not just this one) is actually DELIVERED. Duplicating it here fired a
    # premature "delivered" notification the moment the FIRST leg finished, while other legs were
    # still in transit.
    if fulfillment.pharmacy_id:
        Notification.objects.create(
            user=fulfillment.pharmacy.user, type='ORDER_UPDATE', title='Delivery Completed',
            message=f'Order #{str(fulfillment.order_id)[:8]} was delivered successfully.',
            link='/pharmacy/orders',
        )

    sync_order_status(fulfillment.order)
    return True, None


def collect_cash(fulfillment):
    """Marks a COD fulfillment DELIVERED after cash is collected at the doorstep. Only valid for
    CASH_ON_DELIVERY orders — for an already-paid (Khalti/eSewa) order there's no cash to collect,
    use mark_delivered() instead."""
    if fulfillment.order.payment_method != 'CASH_ON_DELIVERY':
        return False, 'This order was already paid online — use mark_delivered instead.'
    return _deliver_fulfillment(fulfillment)


def mark_delivered(fulfillment):
    """Marks a non-COD (already-paid) fulfillment DELIVERED — same mechanics as collect_cash(),
    just without pretending cash was collected. Rejects CASH_ON_DELIVERY orders the other way, so
    a rider can't accidentally skip actually collecting the cash by hitting the wrong button."""
    if fulfillment.order.payment_method == 'CASH_ON_DELIVERY':
        return False, 'This is a Cash on Delivery order — use collect_cash instead.'
    return _deliver_fulfillment(fulfillment)


def expire_stale_delivery_broadcasts():
    """Reports (does not auto-retry) OrderFulfillments that have sat in AWAITING_DELIVERY longer
    than BROADCAST_WINDOW_MINUTES with no rider accepting. There's no per-agent request row to
    flip to EXPIRED here — AWAITING_DELIVERY already means "still up for grabs" — so this is purely
    a visibility report for admin follow-up (e.g. manually re-broadcasting or widening the radius),
    not a state change of its own."""
    cutoff = timezone.now() - timedelta(minutes=BROADCAST_WINDOW_MINUTES)
    stale = OrderFulfillment.objects.filter(
        status='AWAITING_DELIVERY', delivery_broadcast_at__lt=cutoff,
    )
    return list(stale.values_list('id', flat=True))


def _all_items_resolved(order):
    """True once every OrderItem in the order either has `fulfillment` set (a pharmacy won it),
    or has no PENDING FulfillmentRequest left (every pharmacy that was asked has declined/expired,
    or none were ever eligible in the first place)."""
    for item in order.items.all():
        if item.fulfillment_id is not None:
            continue
        if FulfillmentRequest.objects.filter(order_item=item, status='PENDING').exists():
            return False
    return True


def calculate_agent_payout(fulfillment):
    """Isolated on purpose — this is the one function to change if the payout model ever moves
    from flat-fee to percentage-of-delivery-charge."""
    from .views import _get_setting
    return Decimal(_get_setting('delivery_agent_payout_flat', '40'))


def _create_settlement_records(order):
    """Creates the PharmacyPayout (and, if a rider was involved, DeliveryAgentEarning /
    DeliveryAgentCodLiability) records for every fulfillment on `order`, once — called from
    sync_order_status()'s PLACED -> DELIVERED transition, which can legitimately fire more than
    once, so this stays idempotent per fulfillment via the OneToOneField reverse-accessor check
    below rather than assuming it only ever runs a single time."""
    from .views import _get_setting
    commission_rate = Decimal(_get_setting('pharmacy_commission_rate', '10'))
    is_cod = order.payment_method == 'CASH_ON_DELIVERY'

    for fulfillment in order.fulfillments.all():
        if hasattr(fulfillment, 'pharmacy_payout'):
            continue  # already created — sync_order_status can be called more than once, stay idempotent

        gross = sum(i.unit_price * i.quantity for i in fulfillment.order_items.all())
        commission = (gross * commission_rate / Decimal('100')).quantize(Decimal('0.01'))
        PharmacyPayout.objects.create(
            pharmacy=fulfillment.pharmacy, fulfillment=fulfillment,
            gross_amount=gross, commission_rate=commission_rate, commission_amount=commission,
            net_payable=gross - commission,
            funding_source='PLATFORM_FUNDS' if is_cod else 'ORDER_REVENUE',
        )

        if fulfillment.delivery_agent_id:
            # Always a real payable now — COD no longer self-settles this (see the liability
            # record below for the separate, opposite-direction remittance the agent owes back).
            DeliveryAgentEarning.objects.create(
                agent=fulfillment.delivery_agent, fulfillment=fulfillment,
                amount=calculate_agent_payout(fulfillment),
            )

            if is_cod:
                DeliveryAgentCodLiability.objects.create(
                    agent=fulfillment.delivery_agent, fulfillment=fulfillment,
                    amount_collected=gross + fulfillment.delivery_charge,
                )


def _all_fulfillments_delivered(order):
    """True once the order has at least one OrderFulfillment and every one of them is DELIVERED."""
    fulfillments = list(order.fulfillments.all())
    return bool(fulfillments) and all(f.status == 'DELIVERED' for f in fulfillments)


def sync_order_status(order):
    """Single source of truth for Order.status transitions driven by marketplace/payment/delivery
    state — called reactively after broadcast_order(), pharmacy_accept_item(),
    pharmacy_decline_item(), expire_stale_fulfillment_requests(), and collect_cash() (chosen over a
    separate polling endpoint: the customer already polls GET /orders/<id>/fulfillment-summary/,
    which just reflects whatever `order.status` currently is, so a second polling mechanism on the
    backend would be redundant).
    """
    if order.status == 'BROADCASTING':
        if _all_items_resolved(order):
            # AWAITING_PAYMENT should mean "something is actually ready to pay for" — every item
            # getting a final answer (declined/expired) without a single pharmacy accepting
            # anything is a different, terminal outcome, not "awaiting payment." Routing it to its
            # own status keeps AWAITING_PAYMENT's meaning unambiguous and lets the customer-facing
            # views hide these dead-end orders instead of leaving the customer staring at a
            # "NPR 0 total, nothing to pay" order with no clear next step.
            if order.fulfillments.exists():
                order.status = 'AWAITING_PAYMENT'
                order.save(update_fields=['status'])
                Notification.objects.create(
                    user=order.user, type='ORDER_UPDATE', title='Order Ready for Payment',
                    message=f'Nearby pharmacies have responded to order #{str(order.id)[:8]} — review and pay to confirm.',
                    link=f'/orders/{order.id}',
                )
            else:
                order.status = 'NO_PHARMACY_FOUND'
                order.save(update_fields=['status'])
                Notification.objects.create(
                    user=order.user, type='ORDER_UPDATE', title='No Pharmacy Had Your Items',
                    message=f"No nearby pharmacy had the items in order #{str(order.id)[:8]} in stock — feel free to try again.",
                    link='/medicines',
                )

    elif order.status == 'AWAITING_PAYMENT':
        # COD has no async gateway callback to wait for — the payment view calling this function
        # having already set payment_method='CASH_ON_DELIVERY' IS the confirmation. Khalti/eSewa
        # instead flip payment_status to 'PAID' once their gateway confirms, then call this.
        if order.payment_status == 'PAID' or order.payment_method == 'CASH_ON_DELIVERY':
            order.status = 'PLACED'
            order.save(update_fields=['status'])
            # only a CART order's items ARE the cart's items — a DIRECT ("Buy Now") order bypassed
            # the cart entirely, so clearing it here would delete unrelated items the customer
            # still wants to buy later.
            if order.source == 'CART':
                cart = Cart.objects.filter(user=order.user).first()
                if cart:
                    cart.items.all().delete()
            Notification.objects.create(
                user=order.user, type='ORDER', title='Order Placed',
                message=f'Your order #{str(order.id)[:8]} has been placed successfully.',
                link=f'/orders/{order.id}',
            )
            # NOT auto-broadcasting to riders here anymore — see pharmacy_advance_fulfillment().
            # A fulfillment only reaches AWAITING_DELIVERY once the pharmacy manually advances it
            # through PREPARED -> PACKED -> (broadcast), and that last step itself checks this
            # order is PLACED (payment confirmed) before it's allowed to go out to riders.

    elif order.status == 'PLACED':
        if _all_fulfillments_delivered(order):
            order.status = 'DELIVERED'
            update_fields = ['status']
            # COD has no gateway payment event — full delivery + cash collection IS the
            # confirmation that payment was received, same reasoning as the PLACED transition.
            if order.payment_method == 'CASH_ON_DELIVERY' and order.payment_status == 'PENDING':
                order.payment_status = 'PAID'
                update_fields.append('payment_status')
            order.save(update_fields=update_fields)
            _create_settlement_records(order)
            Notification.objects.create(
                user=order.user, type='ORDER_UPDATE', title='Order Delivered',
                message=f'Your order #{str(order.id)[:8]} has been delivered.',
                link=f'/orders/{order.id}',
            )
