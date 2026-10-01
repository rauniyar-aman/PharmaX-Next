"""Same-day consult booking only offers slots that are still ahead on the clock.

get_available_slots() filters candidate slot start times against "now" — but the backend runs in UTC
(settings.TIME_ZONE) while doctors and patients are in Nepal (UTC+05:45, no DST ever), so "now" has
to be shifted into Nepal wall-clock time before the comparison. These pin that behaviour: today's
already-started slots drop off, a future date is untouched whatever the hour, and — the crux — the
Nepal offset is genuinely applied, so a UTC instant that looks like the morning is correctly treated
as the afternoon it actually is in Kathmandu.

Because the booking endpoint re-checks the chosen slot against this same function, a slot that has
passed also stops being bookable at the same moment it stops being offered.
"""
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest import mock

from django.test import TestCase

from .models import Doctor, DoctorAvailability
from .scheduling import get_available_slots


# A fixed calendar date so the doctor's weekly pattern and the mocked clock line up deterministically,
# whenever the suite happens to run.
FIXED_DATE = date(2026, 9, 28)


def _utc(hour, minute):
    """An aware UTC datetime on FIXED_DATE — what a mocked timezone.now() hands back."""
    return datetime(FIXED_DATE.year, FIXED_DATE.month, FIXED_DATE.day, hour, minute, tzinfo=dt_timezone.utc)


class SameDaySlotFilteringTests(TestCase):
    def setUp(self):
        self.doctor = Doctor.objects.create(
            name='Asha Rai', specialty='Cardiology', consultation_fee=Decimal('1500'),
            is_active=True, is_verified=True, license_number='NMC-9001',
        )
        # Works 09:00–12:00 on FIXED_DATE's weekday → slots 09:00, 09:30, 10:00, 10:30, 11:00, 11:30.
        DoctorAvailability.objects.create(
            doctor=self.doctor, day_of_week=FIXED_DATE.weekday(),
            start_time=time(9, 0), end_time=time(12, 0), slot_duration_minutes=30,
        )
        self.all_slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']

    def test_passed_slots_drop_off_today_and_future_ones_remain(self):
        # Nepal 10:10 == 04:25 UTC. Everything starting at or before 10:10 is already gone.
        with mock.patch('api.scheduling.timezone.now', return_value=_utc(4, 25)):
            self.assertEqual(get_available_slots(self.doctor, FIXED_DATE), ['10:30', '11:00', '11:30'])

    def test_a_fully_past_day_offers_nothing(self):
        # Nepal 20:00 == 14:15 UTC — the whole 09:00–12:00 window is behind us.
        with mock.patch('api.scheduling.timezone.now', return_value=_utc(14, 15)):
            self.assertEqual(get_available_slots(self.doctor, FIXED_DATE), [])

    def test_a_future_date_is_never_filtered_by_the_clock(self):
        # Same weekly hours a week out (same weekday → same pattern). Even at Nepal 23:30 tonight,
        # every slot on that later day still stands — the filter only ever trims the current day.
        future = FIXED_DATE + timedelta(days=7)
        with mock.patch('api.scheduling.timezone.now', return_value=_utc(17, 45)):  # Nepal 23:30 on FIXED_DATE
            self.assertEqual(get_available_slots(self.doctor, future), self.all_slots)

    def test_the_nepal_offset_is_applied_not_raw_utc(self):
        # The crux. It's Nepal 13:00 — past the 12:00 close, so nothing should be offered. The raw UTC
        # instant is 07:15, which (had the +05:45 offset been forgotten) would look like early morning
        # and wrongly keep every 09:00–11:30 slot. Asserting [] proves the offset is really applied.
        with mock.patch('api.scheduling.timezone.now', return_value=_utc(7, 15)):
            self.assertEqual(get_available_slots(self.doctor, FIXED_DATE), [])
