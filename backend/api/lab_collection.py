"""Lab test sample collection — kept separate from matching.py, which is scoped to the
pharmacy/delivery marketplace (see its own docstring), not lab collectors.

Collector assignment is admin-only (AdminLabTestBookingAssignCollectorView in views.py) — there is
no broadcast/self-accept flow here, unlike delivery. collector_confirm_sample_collected() imports
_get_setting from .views inside the function body rather than at module level — views.py imports
from this module at import time, so a top-level `from .views import ...` here would be a circular
import (same reasoning matching.py's own docstring gives for calculate_agent_payout()).
"""
from decimal import Decimal

from django.db import transaction

from .matching import _eta_assumed_speed_kmh, _haversine_km
from .models import LabTestBooking, CollectorEarning, CollectorCodLiability, Notification

# The collector is only "coming to you" in these three states. Before CONFIRMED nobody is assigned;
# from SAMPLE_COLLECTED onward they have left and moved on to other patients. LabCollector.lat/lng
# is a single ever-updating CURRENT position rather than a snapshot, so exposing it outside this
# window would let any past patient keep polling and watch a collector's live location all day —
# the same rule, and the same reason, as _tracking_payload() in matching.py.
LIVE_TRACKING_STATUSES = ('CONFIRMED', 'EN_ROUTE', 'ARRIVED')


def collector_tracking_payload(booking):
    """Where the patient's collector is right now, for one of the patient's own bookings.

    The collector's browser has been pushing coordinates to LabCollector.lat/lng all along
    (LabCollectorLocationUpdateView, driven by the watchPosition on the collector's Active page) —
    this is the read side, which simply never existed: the patient's booking list showed the
    collector's name and nothing else, so "On the way" was a dead end.

    Name and phone stay visible outside the live window as a support/receipt reference; neither
    updates on its own. Distance and ETA are derived, so they disappear with the coordinates.
    """
    collector = booking.collector
    data = {'booking_id': str(booking.id), 'status': booking.status, 'collector': None}
    if not collector:
        return data

    data['collector'] = {
        'name': collector.user.full_name,
        'phone': collector.phone,
        'lat': None,
        'lng': None,
    }
    if booking.status not in LIVE_TRACKING_STATUSES:
        return data

    data['collector']['lat'] = collector.lat
    data['collector']['lng'] = collector.lng
    address = booking.address
    if (collector.lat is not None and collector.lng is not None
            and address is not None and address.lat is not None and address.lng is not None):
        distance_km = _haversine_km(collector.lat, collector.lng, address.lat, address.lng)
        data['distance_km'] = round(distance_km, 1)
        data['eta_minutes'] = round((distance_km / _eta_assumed_speed_kmh()) * 60)
    return data


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
    if locked.status not in ('CONFIRMED', 'EN_ROUTE', 'ARRIVED'):
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


# The three progress transitions below mirror collector_confirm_sample_collected exactly — same
# select_for_update lock, same ownership check, a single source-status guard, then an in-app-only
# Notification (no email, matching the deliberate precedent above: these are lightweight "where's my
# collector" pings, not the account/assignment events that warrant a branded email). They carry no
# money side effects — COD/earnings are created once, at SAMPLE_COLLECTED, and nowhere else.

@transaction.atomic
def collector_mark_en_route(collector, booking):
    """CONFIRMED -> EN_ROUTE. The collector has set out toward the patient's address."""
    locked = LabTestBooking.objects.select_for_update().get(pk=booking.pk)

    if locked.collector_id != collector.id:
        return False, 'This booking is not assigned to you.'
    if locked.status != 'CONFIRMED':
        return False, f'Cannot mark en route for a booking that is {locked.status.replace("_", " ").lower()}.'

    locked.status = 'EN_ROUTE'
    locked.save(update_fields=['status'])

    Notification.objects.create(
        user=locked.user, type='LAB_BOOKING_UPDATE', title='Collector On the Way',
        message=f'Your collector is on the way to collect your {locked.lab_test.name} sample.',
        link=f'/lab-test-bookings/{locked.id}/track',
    )
    return True, None


@transaction.atomic
def collector_mark_arrived(collector, booking):
    """EN_ROUTE -> ARRIVED. The collector is at the patient's door."""
    locked = LabTestBooking.objects.select_for_update().get(pk=booking.pk)

    if locked.collector_id != collector.id:
        return False, 'This booking is not assigned to you.'
    if locked.status != 'EN_ROUTE':
        return False, f'Cannot mark arrived for a booking that is {locked.status.replace("_", " ").lower()}.'

    locked.status = 'ARRIVED'
    locked.save(update_fields=['status'])

    Notification.objects.create(
        user=locked.user, type='LAB_BOOKING_UPDATE', title='Collector Arrived',
        message=f'Your collector has arrived to collect your {locked.lab_test.name} sample.',
        link=f'/lab-test-bookings/{locked.id}/track',
    )
    return True, None


@transaction.atomic
def collector_mark_submitted_to_lab(collector, booking):
    """SAMPLE_COLLECTED -> SUBMITTED_TO_LAB. The collected sample has been handed off to the lab."""
    locked = LabTestBooking.objects.select_for_update().get(pk=booking.pk)

    if locked.collector_id != collector.id:
        return False, 'This booking is not assigned to you.'
    if locked.status != 'SAMPLE_COLLECTED':
        return False, f'Cannot mark submitted to lab for a booking that is {locked.status.replace("_", " ").lower()}.'

    locked.status = 'SUBMITTED_TO_LAB'
    locked.save(update_fields=['status'])

    Notification.objects.create(
        user=locked.user, type='LAB_BOOKING_UPDATE', title='Sample Submitted to Lab',
        message=f'Your {locked.lab_test.name} sample has been submitted to the lab. Your report will be ready soon.',
        link='/lab-test-bookings',
    )
    return True, None
