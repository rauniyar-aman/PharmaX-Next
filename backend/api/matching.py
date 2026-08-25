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

calculate_agent_payout(), _create_settlement_records(), and the _broadcast_radius_km()/
_broadcast_window_minutes()/_priority_window_seconds()/_eta_assumed_speed_kmh() setting readers
below import _get_setting from .views inside the function body rather than at module level —
views.py already imports from this module at import time, so a top-level
`from .views import _get_setting` here would be a circular import.
"""
import math
import secrets
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Value, FloatField, ExpressionWrapper, Avg, Count
from django.db.models.functions import Radians, Sin, Cos, ASin, Sqrt, Power
from django.utils import timezone

from .models import (
    Pharmacy, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, OrderItem, Order, Cart, Notification,
    DeliveryAgent, PharmacyPayout, DeliveryAgentEarning, DeliveryAgentCodLiability, PharmacyCampaignEnrollment,
)

EARTH_RADIUS_KM = 6371.0


# Admin-configurable via SystemSetting (see admin/settings) — read fresh at every call site rather
# than cached at import time, so a change takes effect on the very next broadcast/sweep with no
# restart needed. Each of these used to be a plain module-level constant; the docstrings elsewhere
# in this file that mention them by their old ALL_CAPS names are describing the same concept, now
# backed by live settings instead of a fixed value.
def _broadcast_radius_km():
    from .views import _get_setting
    return float(_get_setting('broadcast_radius_km', '3'))


def _broadcast_window_minutes():
    from .views import _get_setting
    return int(_get_setting('broadcast_window_minutes', '10'))


def _priority_window_seconds():
    """How long a pharmacy that can fulfill EVERY item in an order gets first dibs before the
    order falls back to broadcast_order()'s old per-item behavior (broadcasting to every eligible
    pharmacy regardless of whether they cover the whole order) — see
    widen_stale_priority_broadcasts(). Deliberately much shorter than _broadcast_window_minutes():
    this is a head start, not the whole window an item can sit unanswered before it's
    unfulfillable. An explicit decline widens immediately regardless of this window — see
    pharmacy_decline_item()."""
    from .views import _get_setting
    return int(_get_setting('priority_window_seconds', '30'))


def _eta_assumed_speed_kmh():
    from .views import _get_setting
    return float(_get_setting('eta_assumed_speed_kmh', '20'))


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
    ).filter(distance_km__lte=_broadcast_radius_km())

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
    once PRIORITY_WINDOW_SECONDS passes with no full-coverage acceptance.
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


def _widen_item_now(item):
    """(Re-)broadcasts `item` to its FULL eligible pharmacy pool right now — not just whatever
    full-coverage-only pool broadcast_order() may have started with. Shared by
    widen_stale_priority_broadcasts() (time-based sweep) and pharmacy_decline_item() (immediate,
    on an explicit decline). get_or_create inside _create_requests_for_item() makes this
    idempotent: pharmacies already in the pool are untouched, only the gap gets added. Returns
    True if the item ended up with at least one request."""
    address = item.order.address
    if address is None or address.lat is None or address.lng is None:
        return False
    listings = _eligible_pharmacies_for_item(item, address)
    return _create_requests_for_item(item, listings)


def widen_stale_priority_broadcasts():
    """Opportunistic top-up sweep for the full-coverage priority stage above — there's no real
    task scheduler anywhere in this project (the existing "admin/cron-callable"
    AdminExpireFulfillmentRequestsView, calling expire_stale_fulfillment_requests() below, is
    never actually invoked from anywhere, including its own admin UI — a pre-existing gap, not one
    introduced here), so this is instead called opportunistically from endpoints that are already
    polled every few seconds in practice (PharmacyRequestListView, OrderFulfillmentSummaryView).
    Known limitation: if literally nobody has a relevant page open, an order can sit in its
    priority-only stage past PRIORITY_WINDOW_SECONDS until someone does — no worse than the
    pre-existing (also-orphaned) expiry mechanism this mirrors.

    For every still-unresolved OrderItem (no fulfillment yet) on a still-BROADCASTING order whose
    oldest PENDING request has aged past the window, widens via _widen_item_now() above. An
    explicit decline (see pharmacy_decline_item()) doesn't wait for this sweep at all — this is
    purely for the passive "nobody responded" case.
    """
    cutoff = timezone.now() - timedelta(seconds=_priority_window_seconds())
    stale_item_ids = FulfillmentRequest.objects.filter(
        status='PENDING', created_at__lt=cutoff,
    ).values_list('order_item_id', flat=True).distinct()

    items = OrderItem.objects.filter(
        id__in=stale_item_ids, fulfillment__isnull=True, order__status='BROADCASTING',
    ).select_related('order__address', 'medicine')

    return [item.id for item in items if _widen_item_now(item)]


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

    If this decline leaves the item with zero PENDING requests and still unresolved, widens to
    its full eligible pool immediately rather than waiting on widen_stale_priority_broadcasts()'s
    PRIORITY_WINDOW_SECONDS timer — a real bug this closes: the only pharmacy staged for a
    full-coverage-priority item declining used to fall straight through to sync_order_status()
    seeing "nothing left pending, nothing accepted" and marking the order NO_PHARMACY_FOUND before
    a partial-coverage pharmacy was ever asked. A decline is a definitive "not interested," unlike
    a timeout (which the window buffers for a slow-but-willing pharmacy), so there's nothing to
    gain from waiting here.
    """
    updated = FulfillmentRequest.objects.filter(
        order_item=order_item, pharmacy=pharmacy, status='PENDING',
    ).update(status='DECLINED', responded_at=timezone.now())
    if not updated:
        return False, 'This request is no longer available.'

    if order_item.fulfillment_id is None and not FulfillmentRequest.objects.filter(
        order_item=order_item, status='PENDING',
    ).exists():
        _widen_item_now(order_item)

    sync_order_status(order_item.order)
    return True, None


# The pharmacy-controlled prep stages a fulfillment walks through before it's handed off to a
# rider. Each pharmacy click just moves it one step; ACCEPTED and AWAITING_DELIVERY already exist
# for other reasons (see OrderFulfillment.STATUS), this is only the sequencing between them.
FULFILLMENT_PREP_SEQUENCE = ['ACCEPTED', 'PREPARED', 'PACKED', 'AWAITING_DELIVERY']


def _fulfillment_prescription_ready(fulfillment):
    """False if this fulfillment's slice of the order includes an Rx item whose prescription
    isn't yet admin-VERIFIED. Gates both pharmacy_advance_fulfillment() (a pharmacy can't start
    actually preparing it) and every rider-dispatch trigger below (a rider shouldn't be asked to
    go fetch medicine that isn't legally dispensable yet) — riders are normally broadcast the
    moment payment clears, well before the pharmacy finishes prepping, so without this check an
    unverified Rx order's rider request would go out regardless of pharmacy_advance_fulfillment's
    own gate."""
    return not any(
        item.medicine.type == 'Rx' and (not item.prescription or item.prescription.status != 'VERIFIED')
        for item in fulfillment.order_items.select_related('medicine', 'prescription')
    )


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

    if not _fulfillment_prescription_ready(fulfillment):
        return False, 'Waiting for a prescription to be verified before this order can be prepared.'

    current = fulfillment.status
    if current not in FULFILLMENT_PREP_SEQUENCE[:-1]:
        return False, f'Cannot advance a fulfillment from its current status ({current}).'

    next_status = FULFILLMENT_PREP_SEQUENCE[FULFILLMENT_PREP_SEQUENCE.index(current) + 1]

    if next_status == 'AWAITING_DELIVERY':
        fulfillment.status = next_status
        fulfillment.save(update_fields=['status'])
        # _maybe_finalize_pickup() handles "a rider was already assigned earlier (rider dispatch
        # now happens at PLACED, well before packing) and this was the last leg to finish" — the
        # handoff completes right here if so. _maybe_broadcast_delivery_for_order() is now only a
        # defensive backstop (see its docstring) for orders that reached PLACED before this
        # broadcast-timing change was deployed.
        _maybe_finalize_pickup(fulfillment.order)
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


def pharmacy_verify_pickup_code(pharmacy, fulfillment, code):
    """Pharmacy enters the code the rider recites/shows in person, confirming the person standing
    at the counter is genuinely the rider assigned to this leg — not just anyone who knows the
    order exists. Required (see _maybe_finalize_pickup()) before this leg can ever flip to
    OUT_FOR_DELIVERY, regardless of how ready the pharmacy or how committed the rider otherwise
    are.

    No lockout on repeated wrong attempts — this is a 4-digit code checked by an authenticated,
    already-verified pharmacy account against a fulfillment already assigned to them (see the
    ownership check below), not a public-facing brute-force surface: a rogue pharmacy account
    already has full visibility into every other detail of an order assigned to it, so guessing
    this code buys it nothing it doesn't already have.
    """
    if fulfillment.pharmacy_id != pharmacy.id:
        return False, 'This order does not belong to your pharmacy.'
    if fulfillment.status != 'AWAITING_DELIVERY':
        return False, 'This order is not ready for pickup yet.'
    if not fulfillment.delivery_agent_id:
        return False, 'No rider has been assigned to this order yet.'
    if fulfillment.pickup_verified_at:
        return False, 'Pickup was already verified for this order.'
    if not fulfillment.pickup_code or (code or '').strip() != fulfillment.pickup_code:
        return False, 'Incorrect code — ask the rider to confirm it and try again.'

    fulfillment.pickup_verified_at = timezone.now()
    fulfillment.save(update_fields=['pickup_verified_at'])
    _maybe_finalize_pickup(fulfillment.order)
    return True, None


@transaction.atomic
def expire_stale_fulfillment_requests():
    """Expires every still-PENDING FulfillmentRequest older than BROADCAST_WINDOW_MINUTES.
    Returns (expired_count, unfulfillable_item_ids) — an item is unfulfillable if none of its
    requests were accepted before they expired (i.e. `fulfillment` is still unset)."""
    cutoff = timezone.now() - timedelta(minutes=_broadcast_window_minutes())
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


def _all_legs_awaiting_delivery(order):
    """True once every non-CANCELLED OrderFulfillment on the order has independently reached
    AWAITING_DELIVERY — i.e. every pharmacy has explicitly confirmed it's physically packed and
    ready to hand off. Shared predicate for _maybe_broadcast_delivery_for_order() (the legacy/
    backstop gate) and _maybe_finalize_pickup() (the handoff gate) — both need the exact same bar,
    just for different purposes."""
    fulfillments = list(order.fulfillments.exclude(status='CANCELLED'))
    return bool(fulfillments) and all(f.status == 'AWAITING_DELIVERY' for f in fulfillments)


def _maybe_broadcast_delivery_for_order(order):
    """DEFENSIVE BACKSTOP ONLY as of the rider-dispatch-timing change — the real broadcast trigger
    is now sync_order_status()'s AWAITING_PAYMENT -> PLACED transition (broadcasts the moment
    every leg is known and payment is confirmed, not after packing). This function still exists,
    called from pharmacy_advance_fulfillment()'s PACKED -> AWAITING_DELIVERY step, purely to cover
    any order that reached PLACED before that change was deployed (already past the transition
    that would have broadcast it) — without this, such an order's delivery would never get
    broadcast at all. In the normal post-deploy case every fulfillment here already has
    delivery_broadcast_at set from Part A, so the `is None` check below makes this a no-op.

    Still requires every non-CANCELLED leg to be AWAITING_DELIVERY before broadcasting any of them
    (see _all_legs_awaiting_delivery()) — a split order should never have one leg silently
    broadcast on its own while a sibling leg hasn't even been asked yet.

    KNOWN GAP, accepted for now, not an oversight: if no single delivery agent is ever verified,
    online, AND within BROADCAST_RADIUS_KM of EVERY pharmacy in the set (see
    _agent_eligible_for()'s docstring for why that's the right bar), this combined job can sit
    unclaimed indefinitely with nobody ever eligible to accept it — there is currently no
    fallback that re-splits it back into independently-broadcast legs.
    expire_stale_delivery_broadcasts() only REPORTS a stale broadcast for admin follow-up, it
    doesn't recover one. Expected to be rare in practice (pharmacies both within
    BROADCAST_RADIUS_KM of the same customer are usually reasonably close to each other too), but
    a real limitation worth remembering if delivery pickups start silently stalling.
    """
    if not _all_legs_awaiting_delivery(order):
        return
    for f in order.fulfillments.exclude(status='CANCELLED'):
        # A leg can only reach AWAITING_DELIVERY via pharmacy_advance_fulfillment(), which already
        # refuses to advance it while unverified — this check is just defense-in-depth against any
        # other path ever setting that status directly.
        if f.delivery_broadcast_at is None and _fulfillment_prescription_ready(f):
            broadcast_delivery(f)


def broadcast_delivery(fulfillment):
    """Marks one OrderFulfillment as broadcast to riders, and notifies every currently-eligible
    DeliveryAgent (_agent_eligible_for() — verified, online, and within BROADCAST_RADIUS_KM of
    every pharmacy on this fulfillment's order, not just this one leg's). Called from
    sync_order_status()'s AWAITING_PAYMENT -> PLACED transition (the real trigger — as soon as
    payment is confirmed and the leg set is known, regardless of prep status) and, as a backstop,
    from _maybe_broadcast_delivery_for_order(). Does NOT require or imply the fulfillment is
    AWAITING_DELIVERY — a rider can see and accept this job while it's still ACCEPTED/PREPARED/
    PACKED; see delivery_agent_accept() and _maybe_finalize_pickup() for what happens once a rider
    commits versus once the physical handoff actually completes.

    Unlike broadcast_order()/FulfillmentRequest, there's no per-agent request row: any eligible,
    unclaimed agent can call delivery_agent_accept() at any time — eligibility is re-checked live
    at accept time instead of being frozen at broadcast time. Called once per leg on a split order
    (so a 2-pharmacy order fires this twice) — each pharmacy still gets its own admin notification
    either way, which is the simpler option explicitly allowed over a single merged notification.
    Returns the list of notified DeliveryAgent ids.
    """
    fulfillment.delivery_broadcast_at = timezone.now()
    fulfillment.save(update_fields=['delivery_broadcast_at'])

    pharmacy = fulfillment.pharmacy
    if pharmacy is not None:
        from .views import _notify_admins
        _notify_admins(
            'manage_orders', 'FULFILLMENT_UPDATE', 'Delivery Job Broadcast',
            f'{pharmacy.name} is preparing order #{str(fulfillment.order_id)[:8]} — broadcast to nearby riders.',
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
        if not qs.filter(distance_km__lte=_broadcast_radius_km()).exists():
            return False
    return True


@transaction.atomic
def _maybe_finalize_pickup(order):
    """The actual physical-handoff gate, decoupled from delivery_agent_accept() so it can fire
    from either side of a race between "rider commits" and "pharmacy finishes packing" — but in
    practice now always completes via pharmacy_verify_pickup_code(), since that's the only place
    pickup_verified_at ever gets set. Locks every non-CANCELLED OrderFulfillment on the order
    (order_by('id'), same lock ordering delivery_agent_accept() and pharmacy_advance_fulfillment()
    both use, so the two can't deadlock racing the same order).

    Finalizes (flips every leg to OUT_FOR_DELIVERY and fires the "picked up" notifications) only
    once ALL non-CANCELLED legs share the same assigned delivery_agent, are all AWAITING_DELIVERY
    (_all_legs_awaiting_delivery()), AND have all had their pickup_code verified by their pharmacy
    — i.e. a rider is genuinely committed to every leg, every pharmacy has confirmed physical
    readiness, AND every pharmacy has confirmed it actually handed the package to that exact
    rider. Returns True if it finalized, False otherwise (still waiting on one of the three).
    """
    fulfillments = list(
        OrderFulfillment.objects.select_for_update()
        .filter(order_id=order.id).exclude(status='CANCELLED').order_by('id')
    )
    if not fulfillments:
        return False

    agent = fulfillments[0].delivery_agent
    if agent is None or any(f.delivery_agent_id != agent.id for f in fulfillments):
        return False
    if any(f.status != 'AWAITING_DELIVERY' for f in fulfillments):
        return False
    if any(f.pickup_verified_at is None for f in fulfillments):
        return False

    for f in fulfillments:
        f.status = 'OUT_FOR_DELIVERY'
        f.save(update_fields=['status'])

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

    return True


def _generate_pickup_code():
    """4-digit numeric, easy for a rider to read aloud and a pharmacy to type — not trying to be
    unguessable against a determined attacker, just to confirm the person standing at the counter
    is genuinely the assigned rider rather than anyone who happened to see the order details."""
    return f'{secrets.randbelow(10000):04d}'


@transaction.atomic
def delivery_agent_accept(agent, fulfillment):
    """First-accept-wins, same pattern as pharmacy_accept_item(): locks every non-CANCELLED
    OrderFulfillment on the SAME order (not just the one the rider clicked), ordered by `id` for
    consistent lock ordering — avoids deadlocking against another rider racing a different leg of
    the same split order — so accepting one leg atomically assigns every leg on the order to this
    one agent. One rider covers the whole order, never just the fulfillment they happened to
    click; see _agent_eligible_for() for why eligibility requires proximity to every pharmacy in
    the set, not just one.

    Since rider dispatch now happens as soon as the order is PLACED (see broadcast_delivery()'s
    docstring), a job can be accepted well before any leg has actually finished packing — this
    only COMMITS the rider (sets delivery_agent on every leg) and does NOT assume a physical
    pickup has happened. _maybe_finalize_pickup() is the only thing that ever flips status to
    OUT_FOR_DELIVERY, whether that happens right here (packing already finished before this
    accept — the old-timing case) or later from pharmacy_advance_fulfillment() (this accept
    happened first, and a pharmacy finishing packing is what completes the handoff) — and even
    then only once every leg's pickup_code has been verified by its pharmacy (see
    pharmacy_verify_pickup_code()).

    Also generates one pickup_code, shared across every leg on this order, and shown only to the
    rider — the pharmacy never sees it through its own API, only whatever the rider tells them in
    person. A rider could already see every other order detail here; this is specifically about
    proving it's THEM standing at the counter, not just someone who knows the order exists.
    """
    fulfillment_ids = list(
        OrderFulfillment.objects.filter(order_id=fulfillment.order_id).exclude(status='CANCELLED')
        .order_by('id').values_list('id', flat=True)
    )
    fulfillments = list(
        OrderFulfillment.objects.select_for_update().filter(id__in=fulfillment_ids).order_by('id')
    )

    # delivery_broadcast_at, not just status: a job is only acceptable once it's actually been
    # broadcast (see broadcast_delivery()) and not already claimed by another rider — no longer
    # tied to AWAITING_DELIVERY, since a rider can now commit well before packing finishes.
    if not fulfillments or any(
        f.status in ('OUT_FOR_DELIVERY', 'DELIVERED') or f.delivery_broadcast_at is None or f.delivery_agent_id is not None
        for f in fulfillments
    ):
        return False, 'This delivery is no longer available.'

    if not _agent_eligible_for(agent, fulfillments[0]):
        return False, 'You are not eligible to accept this delivery (must be verified, online, and near every pharmacy in this pickup).'

    code = _generate_pickup_code()
    for f in fulfillments:
        f.delivery_agent = agent
        f.pickup_code = code
        f.save(update_fields=['delivery_agent', 'pickup_code'])

    finalized = _maybe_finalize_pickup(fulfillment.order)
    if not finalized:
        # Not physically ready yet — this is the "committed, heading to pharmacy" moment, distinct
        # from "Out for Delivery" (that notification, and the admin/pharmacy ones, only fire once
        # _maybe_finalize_pickup() actually completes the handoff — firing them here too would be
        # a customer-facing lie about a pickup that hasn't happened, and would double-notify in
        # the case where packing had already finished before this accept).
        Notification.objects.create(
            user=fulfillment.order.user, type='ORDER_UPDATE', title='Rider Assigned',
            message=f'{agent.user.full_name} has been assigned to order #{str(fulfillment.order_id)[:8]} and is heading to pick it up.',
            link=f'/orders/{fulfillment.order_id}',
        )

    return True, None


def update_agent_location(agent, lat, lng):
    """No websockets yet — a simple field update, meant to be called on an interval from the
    rider's side (Stage 6)."""
    agent.lat = lat
    agent.lng = lng
    agent.save(update_fields=['lat', 'lng'])


def _tracking_payload(fulfillment):
    """Shared shape returned by all three tracking endpoints below. `agent` (contact + rating,
    plus live location while still in flight) is populated as soon as a rider is committed to this
    leg (see delivery_agent_accept()) — regardless of whether they've physically picked it up yet,
    a deliberate product choice: the customer/pharmacy should be able to see and reach whoever is
    already assigned, not just once they're OUT_FOR_DELIVERY.

    Live location (lat/lng, and the distance/ETA derived from it) is deliberately withheld once the
    fulfillment reaches DELIVERED or CANCELLED. DeliveryAgent.lat/lng is the rider's single, ever-
    updating CURRENT position — not a snapshot frozen at delivery time — so leaving it in this
    payload after the leg is done would let anyone who was ever delivered to by that rider keep
    polling and watch their live location indefinitely, for a delivery that's completely over. Name/
    phone/rating stay visible after DELIVERED (reasonable to keep as a receipt/support reference and
    to see who the completed rating is for) since none of those are live-updating.

    assigned_agent_name duplicates `agent.name` for pre-existing callers that only ever read the
    name (e.g. the "assigned and heading to pick up" copy) — kept as its own field for backwards
    compatibility rather than removed now that `agent` covers the same ground.

    rating/rating_count are an on-the-fly Avg()/Count() over every OrderFulfillment.rider_rating
    this agent has ever received — not a denormalized column on DeliveryAgent, so there's no
    separate write path to keep in sync with the source ratings.
    """
    agent = fulfillment.delivery_agent
    data = {
        'fulfillment_id': str(fulfillment.id),
        'status': fulfillment.status,
        'pharmacy_name': fulfillment.pharmacy.name if fulfillment.pharmacy else None,
        'assigned_agent_name': agent.user.full_name if agent else None,
        # A leg sitting at ACCEPTED reads identically whether it's just been claimed or is stuck
        # waiting on pharmacy_advance_fulfillment()'s prescription gate — callers use this to swap
        # the "Preparing" label for something honest instead of implying active prep is underway.
        'prescription_ready': _fulfillment_prescription_ready(fulfillment),
    }
    if agent:
        rating_agg = OrderFulfillment.objects.filter(delivery_agent=agent, rider_rating__isnull=False).aggregate(
            avg=Avg('rider_rating'), count=Count('rider_rating'),
        )
        data['agent'] = {
            'name': agent.user.full_name, 'phone': agent.phone,
            'rating': round(rating_agg['avg'], 1) if rating_agg['avg'] is not None else None,
            'rating_count': rating_agg['count'],
            'lat': None, 'lng': None,
        }
        live_tracking = fulfillment.status not in ('DELIVERED', 'CANCELLED')
        if live_tracking:
            data['agent']['lat'] = agent.lat
            data['agent']['lng'] = agent.lng
            address = fulfillment.order.address
            if agent.lat is not None and agent.lng is not None and address is not None and address.lat is not None and address.lng is not None:
                distance_km = _haversine_km(agent.lat, agent.lng, address.lat, address.lng)
                data['distance_km'] = round(distance_km, 1)
                data['eta_minutes'] = round((distance_km / _eta_assumed_speed_kmh()) * 60)
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
    """Reports (does not auto-retry) OrderFulfillments that were broadcast to riders more than
    BROADCAST_WINDOW_MINUTES ago and still haven't been claimed by anyone. Keyed on
    delivery_agent__isnull=True rather than status='AWAITING_DELIVERY': since rider dispatch now
    happens as soon as an order is PLACED (see broadcast_delivery()'s docstring), a leg can be
    broadcast well before it's actually packed — a status='AWAITING_DELIVERY' filter would
    either miss a still-prepping-but-long-unclaimed job entirely, or (worse) fire a "ready for
    pickup ... no rider accepting" alarm on a job that only just became physically ready,
    misreporting how long it's genuinely been sitting unclaimed. delivery_agent__isnull=True is
    the actual "nobody wants this yet" signal, independent of prep stage. There's no per-agent
    request row to flip to EXPIRED here — this is purely a visibility report for admin follow-up
    (e.g. manually re-broadcasting or widening the radius), not a state change of its own.
    Excludes CANCELLED/DELIVERED explicitly — without it, a CANCELLED leg that was broadcast but
    never claimed before cancellation would falsely re-enter this query forever.

    Called opportunistically from already-polled endpoints (DeliveryRequestListView,
    PharmacyRequestListView), same infrastructure-free trigger pattern as
    widen_stale_priority_broadcasts() — see its docstring for why (no real task scheduler exists
    anywhere in this project). delivery_stale_notified_at makes the admin notification fire once
    per fulfillment, not on every poll: without it, a broadcast that's been stale for an hour would
    re-notify every few seconds for as long as nobody accepts it.
    """
    window_minutes = _broadcast_window_minutes()
    cutoff = timezone.now() - timedelta(minutes=window_minutes)
    stale = list(OrderFulfillment.objects.exclude(status__in=['CANCELLED', 'DELIVERED']).filter(
        delivery_agent__isnull=True, delivery_broadcast_at__lt=cutoff,
    ).select_related('pharmacy'))

    unnotified = [f for f in stale if f.delivery_stale_notified_at is None]
    if unnotified:
        from .views import _notify_admins
        now = timezone.now()
        for f in unnotified:
            pharmacy_name = f.pharmacy.name if f.pharmacy else 'a pharmacy'
            _notify_admins(
                'manage_orders', 'FULFILLMENT_UPDATE', 'No Rider Accepted Pickup',
                f'Order #{str(f.order_id)[:8]} at {pharmacy_name} has not been accepted by any '
                f'rider for over {window_minutes} minutes since being offered.',
                link=f'/admin/orders/{f.order_id}',
            )
        OrderFulfillment.objects.filter(id__in=[f.id for f in unnotified]).update(delivery_stale_notified_at=now)

    return [f.id for f in stale]


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


def _pharmacy_commission_rate(pharmacy):
    """The commission rate to use for a payout being created RIGHT NOW for `pharmacy` — an
    ACTIVE enrollment in a DISCOUNT campaign whose starts_at/ends_at currently covers this moment
    overrides the global pharmacy_commission_rate setting. Called from _create_settlement_records()
    at the exact point a PharmacyPayout is created, so the (possibly discounted) rate is correctly
    snapshotted per-payout, matching how commission_rate itself already is — never recalculated
    after the fact, so a campaign ending later doesn't retroactively change past payouts, and a
    payout created after ends_at correctly falls back to the global rate."""
    now = timezone.now()
    enrollment = PharmacyCampaignEnrollment.objects.filter(
        pharmacy=pharmacy, status='ACTIVE',
        campaign__campaign_type='DISCOUNT', campaign__is_active=True,
        campaign__starts_at__lte=now, campaign__ends_at__gte=now,
    ).select_related('campaign').first()
    if enrollment:
        return enrollment.campaign.discounted_commission_rate

    from .views import _get_setting
    return Decimal(_get_setting('pharmacy_commission_rate', '10'))


def _create_settlement_records(order):
    """Creates the PharmacyPayout (and, if a rider was involved, DeliveryAgentEarning /
    DeliveryAgentCodLiability) records for every fulfillment on `order`, once — called from
    sync_order_status()'s PLACED -> DELIVERED transition, which can legitimately fire more than
    once, so this stays idempotent per fulfillment via the OneToOneField reverse-accessor check
    below rather than assuming it only ever runs a single time."""
    is_cod = order.payment_method == 'CASH_ON_DELIVERY'

    for fulfillment in order.fulfillments.all():
        if hasattr(fulfillment, 'pharmacy_payout'):
            continue  # already created — sync_order_status can be called more than once, stay idempotent

        commission_rate = _pharmacy_commission_rate(fulfillment.pharmacy)
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
            # Broadcast to riders right here, the moment payment is confirmed — not after the
            # pharmacy finishes physically packing (pharmacy_advance_fulfillment() used to be the
            # only trigger). Every fulfillment on this order already exists at this point (created
            # by pharmacy_accept_item() while the order was still BROADCASTING) and the full leg
            # set is finalized, so there's nothing left to wait for — a rider can be traveling
            # toward the pharmacy while it preps, instead of only learning the job exists once
            # everything is already packed and staged. broadcast_delivery() itself doesn't assert
            # anything about fulfillment.status; the `is None` guard here (mirroring
            # _maybe_broadcast_delivery_for_order()) is what keeps this idempotent, since this
            # branch has no select_for_update() on `order` to fully rule out a concurrent re-fire.
            # _fulfillment_prescription_ready() skips any leg still waiting on an Rx item's
            # verification — a rider shouldn't be asked to fetch medicine that can't be dispensed
            # yet. Once verified, _notify_prescription_order_outcome() in views.py fires the
            # delayed broadcast; if that's somehow missed, pharmacy_advance_fulfillment()'s own
            # gate plus _maybe_broadcast_delivery_for_order()'s backstop still catch it once the
            # pharmacy reaches AWAITING_DELIVERY.
            for fulfillment in order.fulfillments.exclude(status='CANCELLED'):
                if not _fulfillment_prescription_ready(fulfillment):
                    continue
                if fulfillment.delivery_broadcast_at is None:
                    broadcast_delivery(fulfillment)

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
