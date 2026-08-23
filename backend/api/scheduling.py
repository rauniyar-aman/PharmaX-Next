"""Doctor consult scheduling helpers — kept separate from matching.py, which is scoped to the
pharmacy/delivery marketplace (see its own docstring), not doctor consults.

Doctor availability is never pre-generated into slot-instance rows; get_available_slots() computes
candidate slot start times fresh from the doctor's weekly DoctorAvailability pattern on every call,
then excludes whatever's already booked for that doctor+date+time. No background job needed to
keep slots in sync.
"""
from datetime import datetime, timedelta

from .models import DoctorAvailability, DoctorAppointment


def get_available_slots(doctor, date):
    weekday = date.weekday()
    try:
        avail = DoctorAvailability.objects.get(doctor=doctor, day_of_week=weekday, is_active=True)
    except DoctorAvailability.DoesNotExist:
        return []

    booked = set(DoctorAppointment.objects.filter(
        doctor=doctor, scheduled_date=date, status__in=['PENDING', 'CONFIRMED'],
    ).values_list('time_slot', flat=True))

    slots = []
    current = datetime.combine(date, avail.start_time)
    end = datetime.combine(date, avail.end_time)
    step = timedelta(minutes=avail.slot_duration_minutes)
    while current + step <= end:
        slot_str = current.strftime('%H:%M')
        if slot_str not in booked:
            slots.append(slot_str)
        current += step
    return slots
