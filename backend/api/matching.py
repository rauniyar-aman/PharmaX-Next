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


def broadcast_order(order):
    """For every OrderItem in the order, find pharmacies within BROADCAST_RADIUS_KM that list
    that medicine, with sufficient stock, verified + active, and create a FulfillmentRequest for
    each. Returns {'broadcast': [order_item_id, ...], 'unfulfillable': [order_item_id, ...]}.

    There's no persisted "unfulfillable" flag on OrderItem — Stage 1 deliberately didn't add one.
    An item with zero FulfillmentRequest rows (and no `fulfillment` set) IS the unfulfillable
    state; this return value is just a convenience summary for the caller.
    """
    result = {'broadcast': [], 'unfulfillable': []}
    address = order.address

    if address is None or address.lat is None or address.lng is None:
        for item in order.items.all():
            result['unfulfillable'].append(item.id)
        sync_order_status(order)
        return result

    nearby_pharmacies = _annotate_distance_km(
        Pharmacy.objects.filter(is_verified=True, is_active=True),
        address.lat, address.lng,
    ).filter(distance_km__lte=BROADCAST_RADIUS_KM)

    for item in order.items.select_related('medicine'):
        eligible = PharmacyMedicineListing.objects.filter(
            pharmacy__in=nearby_pharmacies,
            medicine=item.medicine,
            is_available=True,
            stock_quantity__gte=item.quantity,
            expiry_date__gt=timezone.now().date(),
        ).select_related('pharmacy')

        created_any = False
        for listing in eligible:
            # get_or_create rather than create: makes a re-broadcast of the same order safe to
            # call twice (unique_together on order_item+pharmacy would otherwise raise).
            _req, req_created = FulfillmentRequest.objects.get_or_create(order_item=item, pharmacy=listing.pharmacy)
            if req_created:
                Notification.objects.create(
                    user=listing.pharmacy.user, type='NEW_FULFILLMENT_REQUEST', title='New Order Request',
                    message=f'A nearby customer needs {item.medicine.name} × {item.quantity}.',
                    link='/pharmacy/requests',
                )
            created_any = True

        result['broadcast' if created_any else 'unfulfillable'].append(item.id)

    # covers the edge case where every item had zero eligible pharmacies from the start —
    # there's nothing PENDING to wait on, so the order is already "resolved" right now.
    sync_order_status(order)
    return result


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
        broadcast_delivery(fulfillment)
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


def broadcast_delivery(fulfillment):
    """Moves one OrderFulfillment (a single pharmacy pickup leg) into AWAITING_DELIVERY and
    notifies every verified, online DeliveryAgent within BROADCAST_RADIUS_KM of the pickup
    pharmacy — not the customer's delivery address, the rider has to get to the pharmacy first.

    Unlike broadcast_order()/FulfillmentRequest, there's no per-agent request row: any eligible
    agent can call delivery_agent_accept() at any time while status stays AWAITING_DELIVERY —
    eligibility is re-checked live at accept time instead of being frozen at broadcast time.
    Returns the list of notified DeliveryAgent ids.
    """
    fulfillment.status = 'AWAITING_DELIVERY'
    fulfillment.delivery_broadcast_at = timezone.now()
    fulfillment.save(update_fields=['status', 'delivery_broadcast_at'])

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

    nearby_agents = _annotate_distance_km(
        DeliveryAgent.objects.filter(is_verified=True, is_online=True),
        pharmacy.lat, pharmacy.lng,
    ).filter(distance_km__lte=BROADCAST_RADIUS_KM)

    notified_ids = []
    notifications = []
    for agent in nearby_agents.select_related('user'):
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
    verified, online, and currently within range of the pickup pharmacy."""
    if not (agent.is_verified and agent.is_online):
        return False
    pharmacy = fulfillment.pharmacy
    if pharmacy is None or pharmacy.lat is None or pharmacy.lng is None:
        return False
    if agent.lat is None or agent.lng is None:
        return False
    qs = _annotate_distance_km(DeliveryAgent.objects.filter(pk=agent.pk), pharmacy.lat, pharmacy.lng)
    return qs.filter(distance_km__lte=BROADCAST_RADIUS_KM).exists()


@transaction.atomic
def delivery_agent_accept(agent, fulfillment):
    """First-accept-wins, same pattern as pharmacy_accept_item(): locks the OrderFulfillment row
    itself (the row every competing rider shares, since there's no per-agent request row here) so
    two riders racing on the same delivery are genuinely serialized under concurrent callers.
    """
    ful = OrderFulfillment.objects.select_for_update().get(pk=fulfillment.pk)

    if ful.status != 'AWAITING_DELIVERY':
        return False, 'This delivery is no longer available.'

    if not _agent_eligible_for(agent, ful):
        return False, 'You are not eligible to accept this delivery (must be verified, online, and near the pickup pharmacy).'

    ful.delivery_agent = agent
    ful.status = 'OUT_FOR_DELIVERY'
    ful.save(update_fields=['delivery_agent', 'status'])

    from .views import _notify_admins
    pharmacy_name = ful.pharmacy.name if ful.pharmacy else 'the pharmacy'
    _notify_admins(
        'manage_orders', 'FULFILLMENT_UPDATE', 'Rider Picked Up Order',
        f'{agent.user.full_name} picked up order #{str(ful.order_id)[:8]} from {pharmacy_name}.',
        link=f'/admin/orders/{ful.order_id}',
    )

    # Customer and pharmacy both need per-order awareness of this — deliberately no admin
    # per-delivery notification here (that's the _notify_admins call above, which is the intended
    # admin-facing signal); see pharmax-rider-tracking-spec.md Part 1.
    Notification.objects.create(
        user=ful.order.user, type='ORDER_UPDATE', title='Order Out for Delivery',
        message=f'{agent.user.full_name} is on the way with order #{str(ful.order_id)[:8]}.',
        link=f'/orders/{ful.order_id}',
    )
    if ful.pharmacy_id:
        Notification.objects.create(
            user=ful.pharmacy.user, type='ORDER_UPDATE', title='Rider Picked Up',
            message=f'{agent.user.full_name} picked up order #{str(ful.order_id)[:8]}.',
            link='/pharmacy/orders',
        )

    return True, None


def update_agent_location(agent, lat, lng):
    """No websockets yet — a simple field update, meant to be called on an interval from the
    rider's side (Stage 6)."""
    agent.lat = lat
    agent.lng = lng
    agent.save(update_fields=['lat', 'lng'])


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
