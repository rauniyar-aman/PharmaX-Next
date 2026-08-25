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

from .models import LabTestBooking, CollectorEarning, CollectorCodLiability, Notification


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
