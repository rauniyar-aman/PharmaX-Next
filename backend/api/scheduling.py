"""Doctor consult scheduling helpers — kept separate from matching.py, which is scoped to the
pharmacy/delivery marketplace (see its own docstring), not doctor consults.

Doctor availability is never pre-generated into slot-instance rows; get_available_slots() computes
candidate slot start times fresh from the doctor's hours for that date on every call, then excludes
whatever's already booked. Those hours come from the weekly DoctorAvailability pattern unless a
DoctorDateAvailability row overrides that single date. No background job needed to keep slots in
sync — and because the booking endpoint re-checks the chosen slot against this same function, a
date the doctor closes stops taking bookings everywhere at once.
"""
from datetime import datetime, timedelta

from django.utils import timezone

from .models import DoctorAvailability, DoctorDateAvailability, DoctorAppointment

# Nepal is a fixed UTC+05:45 and has never observed daylight saving, so the offset is safe to
# hardcode rather than depend on a tz database being installed on the host (Render / Windows dev).
# The backend runs in UTC (settings.TIME_ZONE), so "now, in the doctor's own day" has to be shifted
# by this before it can be compared against a slot's wall-clock start time.
NEPAL_UTC_OFFSET = timedelta(hours=5, minutes=45)


def working_hours(doctor, date):
    """(start, end, slot length) the doctor works on one specific date, or None if they don't.

    A DoctorDateAvailability row for the date beats the weekly pattern outright — that's what lets
    a doctor take a one-off day off, shorten a single morning, or open a Sunday they never normally
    work, without editing the pattern every other date depends on.
    """
    override = DoctorDateAvailability.objects.filter(doctor=doctor, date=date).first()
    if override is not None:
        # start/end are null on a closed date; treat a half-written row as closed rather than
        # guessing hours the doctor never gave.
        if not override.is_available or not override.start_time or not override.end_time:
            return None
        return override.start_time, override.end_time, override.slot_duration_minutes

    try:
        avail = DoctorAvailability.objects.get(doctor=doctor, day_of_week=date.weekday(), is_active=True)
    except DoctorAvailability.DoesNotExist:
        return None
    return avail.start_time, avail.end_time, avail.slot_duration_minutes


def get_available_slots(doctor, date):
    hours = working_hours(doctor, date)
    if hours is None:
        return []
    start_time, end_time, slot_minutes = hours
    if slot_minutes <= 0:
        return []  # a zero-length slot would step the loop below forever

    booked = set(DoctorAppointment.objects.filter(
        doctor=doctor, scheduled_date=date, status__in=['PENDING', 'CONFIRMED'],
    ).values_list('time_slot', flat=True))

    # A slot that has already started can't be booked, so today's morning slots drop off as the day
    # goes on and a past date offers nothing at all. The comparison has to be in the doctor's own
    # wall clock (Nepal): timezone.now() is UTC, ~5h45m behind, and using it raw would keep slots
    # that have really already passed. Because the booking endpoint re-checks the chosen slot
    # against this same function, this is also what rejects a slot the patient sat on until it went.
    now_nepal = timezone.now().replace(tzinfo=None) + NEPAL_UTC_OFFSET

    slots = []
    current = datetime.combine(date, start_time)
    end = datetime.combine(date, end_time)
    step = timedelta(minutes=slot_minutes)
    while current + step <= end:
        slot_str = current.strftime('%H:%M')
        if current > now_nepal and slot_str not in booked:
            slots.append(slot_str)
        current += step
    return slots
