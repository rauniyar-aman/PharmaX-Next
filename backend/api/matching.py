"""Pharmacy/delivery marketplace matching engine (Stage 2 of the marketplace spec).

Internal functions only — no HTTP layer here. broadcast_order() and pharmacy_accept_item()/
pharmacy_decline_item() are meant to be called directly (from a checkout flow in Stage 3, from a
pharmacy-facing API in a later stage, or from the Django shell for testing). The only HTTP-facing
piece of Stage 2 is the admin/cron-callable expiry endpoint in views.py, which just calls
expire_stale_fulfillment_requests().
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import F, Value, FloatField, ExpressionWrapper
from django.db.models.functions import Radians, Sin, Cos, ASin, Sqrt, Power
from django.utils import timezone

from .models import Pharmacy, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, OrderItem

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
    return expired_count, unfulfillable_item_ids
