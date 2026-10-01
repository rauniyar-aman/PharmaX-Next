"""Item 3 — date-specific doctor availability.

The weekly DoctorAvailability pattern says what a doctor does on a typical Tuesday; a
DoctorDateAvailability row says what they do on *one* calendar date, and it wins outright for that
date (scheduling.working_hours reads it first). That single override is what lets a doctor take a
one-off day off, shorten a single morning, or open a Sunday they never normally work — without
disturbing every other date the pattern drives.

These cover the CRUD endpoints the doctor uses, the scheduling override at the heart of the feature,
and that the public booking path honours a closed date.
"""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, Doctor, DoctorAvailability, DoctorDateAvailability, DoctorAppointment
from .scheduling import get_available_slots, working_hours


def _next_weekday(target_weekday, *, after_days=1):
    """The first date at least `after_days` out that falls on `target_weekday` (0=Mon)."""
    d = date.today() + timedelta(days=after_days)
    while d.weekday() != target_weekday:
        d += timedelta(days=1)
    return d


class DoctorDateAvailabilityScheduleTests(APITestCase):
    """The scheduling override — pure function level, no HTTP."""

    def setUp(self):
        self.doctor = Doctor.objects.create(
            name='Asha Rai', specialty='Cardiology', consultation_fee=Decimal('1500'),
            is_active=True, is_verified=True, license_number='NMC-3001',
        )
        # Works Mondays 10:00–12:00 in the weekly pattern; every other weekday is a gap.
        DoctorAvailability.objects.create(
            doctor=self.doctor, day_of_week=0, start_time=time(10, 0), end_time=time(12, 0),
            slot_duration_minutes=30,
        )

    def test_weekly_pattern_drives_a_date_with_no_override(self):
        monday = _next_weekday(0)
        self.assertEqual(working_hours(self.doctor, monday), (time(10, 0), time(12, 0), 30))
        self.assertEqual(get_available_slots(self.doctor, monday), ['10:00', '10:30', '11:00', '11:30'])

    def test_a_closed_date_overrides_a_working_weekday(self):
        monday = _next_weekday(0)
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=monday, is_available=False)
        self.assertIsNone(working_hours(self.doctor, monday))
        self.assertEqual(get_available_slots(self.doctor, monday), [])

    def test_an_open_date_overrides_a_non_working_weekday(self):
        sunday = _next_weekday(6)  # the pattern never covers Sunday
        self.assertEqual(get_available_slots(self.doctor, sunday), [])
        DoctorDateAvailability.objects.create(
            doctor=self.doctor, date=sunday, is_available=True,
            start_time=time(14, 0), end_time=time(15, 0), slot_duration_minutes=30,
        )
        self.assertEqual(get_available_slots(self.doctor, sunday), ['14:00', '14:30'])

    def test_an_open_date_with_new_hours_overrides_the_weekly_hours(self):
        monday = _next_weekday(0)
        DoctorDateAvailability.objects.create(
            doctor=self.doctor, date=monday, is_available=True,
            start_time=time(15, 0), end_time=time(16, 0), slot_duration_minutes=30,
        )
        # Not the pattern's 10:00–12:00 — the row's own hours.
        self.assertEqual(get_available_slots(self.doctor, monday), ['15:00', '15:30'])

    def test_a_half_written_open_row_is_treated_as_closed_not_guessed(self):
        monday = _next_weekday(0)
        DoctorDateAvailability.objects.create(
            doctor=self.doctor, date=monday, is_available=True, start_time=time(15, 0), end_time=None,
        )
        self.assertIsNone(working_hours(self.doctor, monday))


class DoctorDateAvailabilityApiTests(APITestCase):
    """The endpoints the doctor's availability page calls."""

    def setUp(self):
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000701', password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, name='Asha Rai', specialty='Cardiology', consultation_fee=Decimal('1500'),
            is_active=True, is_verified=True, license_number='NMC-3002',
        )
        self.other_user = User.objects.create_user(
            email='doc2@example.com', full_name='Bimal Shah', phone='9800000702', password='pass12345', role='DOCTOR',
        )
        self.other = Doctor.objects.create(
            user=self.other_user, name='Bimal Shah', specialty='ENT', consultation_fee=Decimal('900'),
            is_active=True, is_verified=True, license_number='NMC-3003',
        )
        self.tomorrow = date.today() + timedelta(days=1)

    def _auth(self, user=None):
        self.client.force_authenticate(user or self.doctor_user)

    # ── create ────────────────────────────────────────────────────────────────
    def test_doctor_can_add_a_day_off(self):
        self._auth()
        res = self.client.post('/api/doctor/availability/dates/', {
            'date': str(self.tomorrow), 'is_available': False, 'note': 'Conference',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        row = DoctorDateAvailability.objects.get(doctor=self.doctor, date=self.tomorrow)
        self.assertFalse(row.is_available)
        self.assertEqual(row.note, 'Conference')

    def test_doctor_can_add_a_one_off_open_date_with_hours(self):
        self._auth()
        res = self.client.post('/api/doctor/availability/dates/', {
            'date': str(self.tomorrow), 'is_available': True,
            'start_time': '14:00', 'end_time': '17:00', 'slot_duration_minutes': 30,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        row = DoctorDateAvailability.objects.get(doctor=self.doctor, date=self.tomorrow)
        self.assertTrue(row.is_available)
        self.assertEqual(row.start_time, time(14, 0))

    def test_an_open_date_needs_both_start_and_end(self):
        self._auth()
        res = self.client.post('/api/doctor/availability/dates/', {
            'date': str(self.tomorrow), 'is_available': True, 'start_time': '14:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_past_date_is_refused_on_create(self):
        self._auth()
        res = self.client.post('/api/doctor/availability/dates/', {
            'date': str(date.today() - timedelta(days=1)), 'is_available': False,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_second_entry_for_the_same_date_is_refused(self):
        self._auth()
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        res = self.client.post('/api/doctor/availability/dates/', {
            'date': str(self.tomorrow), 'is_available': False,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ── list ──────────────────────────────────────────────────────────────────
    def test_list_returns_only_upcoming_dates_for_this_doctor(self):
        self._auth()
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        # A past row (kept for history) and another doctor's row must not appear.
        past = DoctorDateAvailability.objects.create(doctor=self.doctor, date=date.today() - timedelta(days=3), is_available=False)
        DoctorDateAvailability.objects.create(doctor=self.other, date=self.tomorrow, is_available=False)
        res = self.client.get('/api/doctor/availability/dates/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        dates = [d['date'] for d in res.data['data']['dates']]
        self.assertEqual(dates, [str(self.tomorrow)])
        self.assertNotIn(str(past.date), dates)

    def test_list_folds_in_the_booked_appointment_count(self):
        self._auth()
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        DoctorAppointment.objects.create(
            user=User.objects.create_user(email='p@example.com', full_name='P', phone='9811111111', password='x'),
            doctor=self.doctor, scheduled_date=self.tomorrow, time_slot='10:00',
            status='CONFIRMED', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'), payment_status='PAID',
        )
        res = self.client.get('/api/doctor/availability/dates/')
        self.assertEqual(res.data['data']['dates'][0]['booked_appointments'], 1)

    # ── update / delete ─────────────────────────────────────────────────────────
    def test_doctor_can_reopen_a_closed_date(self):
        self._auth()
        row = DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False,
                                                    start_time=time(9, 0), end_time=time(12, 0))
        res = self.client.patch(f'/api/doctor/availability/dates/{row.id}/', {'is_available': True}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row.refresh_from_db()
        self.assertTrue(row.is_available)

    def test_doctor_can_delete_a_date_entry(self):
        self._auth()
        row = DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        res = self.client.delete(f'/api/doctor/availability/dates/{row.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(DoctorDateAvailability.objects.filter(id=row.id).exists())

    def test_a_doctor_cannot_touch_another_doctors_date_entry(self):
        self._auth()
        row = DoctorDateAvailability.objects.create(doctor=self.other, date=self.tomorrow, is_available=False)
        res = self.client.patch(f'/api/doctor/availability/dates/{row.id}/', {'is_available': True}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_the_endpoints_require_a_doctor(self):
        self.client.force_authenticate(
            User.objects.create_user(email='cust@example.com', full_name='C', phone='9812121212', password='x')
        )
        res = self.client.get('/api/doctor/availability/dates/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ── booking path honours a closed date ───────────────────────────────────────
    def test_slots_endpoint_flags_a_closed_date_and_offers_nothing(self):
        DoctorAvailability.objects.create(
            doctor=self.doctor, day_of_week=self.tomorrow.weekday(),
            start_time=time(10, 0), end_time=time(12, 0), slot_duration_minutes=30,
        )
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        self.client.force_authenticate(
            User.objects.create_user(email='booker@example.com', full_name='B', phone='9813131313', password='x')
        )
        res = self.client.get(f'/api/doctors/{self.doctor.id}/slots/', {'date': str(self.tomorrow)})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['slots'], [])
        self.assertTrue(res.data['data']['date_off'])

    def test_booking_a_slot_on_a_closed_date_is_rejected(self):
        DoctorAvailability.objects.create(
            doctor=self.doctor, day_of_week=self.tomorrow.weekday(),
            start_time=time(10, 0), end_time=time(12, 0), slot_duration_minutes=30,
        )
        DoctorDateAvailability.objects.create(doctor=self.doctor, date=self.tomorrow, is_available=False)
        self.client.force_authenticate(
            User.objects.create_user(email='booker2@example.com', full_name='B2', phone='9814141414', password='x')
        )
        res = self.client.post('/api/doctors/appointments/', {
            'doctor_id': str(self.doctor.id), 'scheduled_date': str(self.tomorrow), 'time_slot': '10:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
