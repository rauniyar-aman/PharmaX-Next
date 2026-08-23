"""Lab test sample collection matching — kept separate from matching.py, which is scoped to the
pharmacy/delivery marketplace (see its own docstring), not lab collectors.

Reuses _annotate_distance_km()/BROADCAST_RADIUS_KM from matching.py rather than duplicating the
haversine logic — the "which nearby collector picks up this already-booked, already-decided test"
problem is the exact same shape as delivery's broadcast/first-accept-wins, just for a single
booking instead of a multi-leg order, so there's no bundling logic to mirror here.

broadcast_collector()/collector_accept()/collector_confirm_sample_collected() import _get_setting
and _notify_admins from .views inside the function body rather than at module level — views.py
imports from this module at import time, so a top-level `from .views import ...` here would be a
circular import (same reasoning matching.py's own docstring gives for calculate_agent_payout()).
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import LabTestBooking, LabCollector, CollectorEarning, CollectorCodLiability, Notification
from .matching import _annotate_distance_km, BROADCAST_RADIUS_KM


def broadcast_collector(booking):
    """Marks a booking as broadcast to collectors, and notifies every currently-eligible
    LabCollector (verified, online, within BROADCAST_RADIUS_KM of booking.address) — same
    haversine radius match already proven for broadcast_delivery(). Single-booking analogue: no
    multi-leg bundling needed, since a lab test booking is always exactly one collection visit,
    never split across multiple addresses/legs the way a pharmacy order can be. Called from
    _confirm_lab_test_booking() the moment a booking reaches CONFIRMED. Returns the list of
    notified LabCollector ids."""
    booking.collector_broadcast_at = timezone.now()
    booking.save(update_fields=['collector_broadcast_at'])

    from .views import _notify_admins
    _notify_admins(
        'manage_lab_tests', 'LAB_BOOKING_UPDATE', 'Collection Job Broadcast',
        f'{booking.user.full_name}\'s {booking.lab_test.name} booking is confirmed — broadcast to nearby collectors.',
        link='/admin/lab-tests',
    )

    address = booking.address
    if address is None or address.lat is None or address.lng is None:
        return []

    candidate_collectors = LabCollector.objects.filter(is_verified=True, is_online=True).select_related('user')
    eligible_collectors = _annotate_distance_km(candidate_collectors, address.lat, address.lng).filter(distance_km__lte=BROADCAST_RADIUS_KM)

    notified_ids = []
    notifications = []
    for collector in eligible_collectors:
        notifications.append(Notification(
            user=collector.user, type='COLLECTION_REQUEST', title='New Sample Collection Available',
            message=f'A {booking.lab_test.name} sample collection is available near you.',
            link='/lab-collector/requests',
        ))
        notified_ids.append(collector.id)
    if notifications:
        Notification.objects.bulk_create(notifications)

    return notified_ids


def _collector_eligible_for(collector, booking):
    """Live eligibility gate collector_accept() uses — verified, online, and currently within
    range of the booking's address. Mirrors _agent_eligible_for() minus the multi-pharmacy
    bundling check, which doesn't apply here."""
    if not (collector.is_verified and collector.is_online):
        return False
    if collector.lat is None or collector.lng is None:
        return False
    address = booking.address
    if address is None or address.lat is None or address.lng is None:
        return False
    qs = _annotate_distance_km(LabCollector.objects.filter(pk=collector.pk), address.lat, address.lng)
    return qs.filter(distance_km__lte=BROADCAST_RADIUS_KM).exists()


@transaction.atomic
def collector_accept(collector, booking):
    """First-accept-wins, same select_for_update() pattern already proven correct under real
    concurrency for delivery_agent_accept() — locks the single booking row so two collectors
    racing the same booking can't both win. booking.status stays CONFIRMED after this; only
    collector_confirm_sample_collected() moves it to SAMPLE_COLLECTED, once the collector actually
    shows up — no intermediate "en route" status needed for a single collection visit."""
    locked = LabTestBooking.objects.select_for_update().get(pk=booking.pk)

    if locked.collector_broadcast_at is None or locked.collector_id is not None or locked.status != 'CONFIRMED':
        return False, 'This collection is no longer available.'

    if not _collector_eligible_for(collector, locked):
        return False, 'You are not eligible to accept this collection (must be verified, online, and near the address).'

    locked.collector = collector
    locked.save(update_fields=['collector'])

    Notification.objects.create(
        user=locked.user, type='LAB_BOOKING_UPDATE', title='Collector Assigned',
        message=f'{collector.user.full_name} has been assigned to collect your {locked.lab_test.name} sample.',
        link='/lab-test-bookings',
    )
    return True, None


@transaction.atomic
def collector_confirm_sample_collected(collector, booking, amount_confirmed=None):
    """Flips a booking to SAMPLE_COLLECTED. If CASH_ON_DELIVERY, this is also where cash gets
    collected — amount_confirmed must match booking.total_amount exactly (same defensive pattern
    as collect_cash() for deliveries), creating the CollectorCodLiability and flipping
    payment_status to PAID. Either way, creates the CollectorEarning here — a real payable
    regardless of how the customer paid — guarded by the same hasattr() idempotency pattern as
    _create_settlement_records(), in case this is somehow called twice."""
    locked = LabTestBooking.objects.select_for_update().get(pk=booking.pk)

    if locked.collector_id != collector.id:
        return False, 'This booking is not assigned to you.'
    if locked.status != 'CONFIRMED':
        return False, f'Cannot confirm collection for a booking that is {locked.status.replace("_", " ").lower()}.'

    is_cod = locked.payment_method == 'CASH_ON_DELIVERY'
    if is_cod:
        if amount_confirmed is None:
            return False, 'amount_confirmed is required to confirm a cash collection.'
        try:
            amount_confirmed = Decimal(str(amount_confirmed))
        except Exception:
            return False, 'amount_confirmed must be a number.'
        if amount_confirmed != locked.total_amount:
            return False, f'Amount confirmed (NPR {amount_confirmed}) does not match the booking total (NPR {locked.total_amount}).'

    locked.status = 'SAMPLE_COLLECTED'
    update_fields = ['status']
    if is_cod:
        CollectorCodLiability.objects.create(collector=collector, booking=locked, amount_collected=locked.total_amount)
        locked.payment_status = 'PAID'
        update_fields.append('payment_status')
    locked.save(update_fields=update_fields)

    if not hasattr(locked, 'collector_earning'):
        from .views import _get_setting
        amount = Decimal(_get_setting('lab_collector_payout_flat', '30'))
        CollectorEarning.objects.create(collector=collector, booking=locked, amount=amount)

    Notification.objects.create(
        user=locked.user, type='LAB_BOOKING_UPDATE', title='Sample Collected',
        message=f'Your {locked.lab_test.name} sample has been collected. Your report will be ready soon.',
        link='/lab-test-bookings',
    )
    return True, None
