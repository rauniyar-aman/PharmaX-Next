"""Pharmacy/delivery marketplace matching engine (Stages 2-3 of the marketplace spec).

broadcast_order(), pharmacy_accept_item(), and pharmacy_decline_item() are internal functions —
no HTTP layer of their own (Stage 3's checkout view in views.py calls broadcast_order(); a
pharmacy-facing accept/decline API is a later stage). The only HTTP-facing piece of this module is
the admin/cron-callable expiry endpoint in views.py, which just calls
expire_stale_fulfillment_requests().

sync_order_status() is the single source of truth for Order.status transitions and is called
reactively at the end of every function above that can change whether an order's items are
resolved — see its own docstring for the transition table.
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import F, Value, FloatField, ExpressionWrapper
from django.db.models.functions import Radians, Sin, Cos, ASin, Sqrt, Power
from django.utils import timezone

from .models import Pharmacy, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, OrderItem, Order, Cart, Notification

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
            FulfillmentRequest.objects.get_or_create(order_item=item, pharmacy=listing.pharmacy)
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
    if not created and fulfillment.status == 'BROADCASTING':
        fulfillment.status = 'ACCEPTED'
        fulfillment.accepted_at = timezone.now()
        fulfillment.save(update_fields=['status', 'accepted_at'])

    item.fulfillment = fulfillment
    item.save(update_fields=['fulfillment'])

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


def sync_order_status(order):
    """Single source of truth for Order.status transitions driven by marketplace/payment state —
    called reactively after broadcast_order(), pharmacy_accept_item(), pharmacy_decline_item(),
    and expire_stale_fulfillment_requests() (chosen over a separate polling endpoint: the customer
    already polls GET /orders/<id>/fulfillment-summary/, which just reflects whatever `order.status`
    currently is, so a second polling mechanism on the backend would be redundant).

    Stage 3 only exercises the first two transitions below. Stage 4 will extend this function to
    also roll up PLACED→...→DELIVERED from the order's OrderFulfillment statuses — that rollup
    isn't implemented yet since delivery broadcast doesn't exist until Stage 4.
    """
    if order.status == 'BROADCASTING':
        if _all_items_resolved(order):
            order.status = 'AWAITING_PAYMENT'
            order.save(update_fields=['status'])
            Notification.objects.create(
                user=order.user, type='ORDER_UPDATE', title='Order Ready for Payment',
                message=f'Nearby pharmacies have responded to order #{str(order.id)[:8]} — review and pay to confirm.',
                link=f'/orders/{order.id}',
            )

    elif order.status == 'AWAITING_PAYMENT':
        # COD has no async gateway callback to wait for — the payment view calling this function
        # having already set payment_method='CASH_ON_DELIVERY' IS the confirmation. Khalti/eSewa
        # instead flip payment_status to 'PAID' once their gateway confirms, then call this.
        if order.payment_status == 'PAID' or order.payment_method == 'CASH_ON_DELIVERY':
            order.status = 'PLACED'
            order.save(update_fields=['status'])
            cart = Cart.objects.filter(user=order.user).first()
            if cart:
                cart.items.all().delete()
            Notification.objects.create(
                user=order.user, type='ORDER', title='Order Placed',
                message=f'Your order #{str(order.id)[:8]} has been placed successfully.',
                link=f'/orders/{order.id}',
            )
            # TODO: Stage 4 - trigger delivery broadcast here
