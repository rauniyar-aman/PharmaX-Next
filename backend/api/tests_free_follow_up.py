"""The free follow-up window: returning to the same doctor shortly after a consultation costs
nothing, and the doctor is still paid in full.

The entitlement rides the machinery that already existed for Plus-free consultations —
`fee_charged=0`, `payment_status='NOT_REQUIRED'`, immediate confirmation, and a `DoctorPayout`
computed from `fee_amount` rather than what the patient paid. What's worth pinning here is the
three limits that stop a free-follow-up from becoming a free consultation forever:

  * the window runs to the APPOINTMENT's date, not to today, so a patient can't book months ahead
    on their last free day;
  * one free follow-up per consultation, released again if that follow-up is cancelled;
  * a free follow-up can't itself source another.

Run with `python manage.py test api.tests_free_follow_up`.
"""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone

from .models import (
    User, Doctor, DoctorAppointment, DoctorAvailability, DoctorPayout,
    PlusBenefit, PlusMembership, PlusPlan, SystemSetting,
)


class FreeFollowUpTests(APITestCase):
    def setUp(self):
        # notify_user/_notify_admins fan out to email on a thread; keep the suite offline.
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000401', password='pass12345',
        )
        self.doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000402',
            password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, name='Asha Rai', specialty='Cardiology',
            consultation_fee=Decimal('1500'), is_verified=True,
        )
        self.other_doctor = Doctor.objects.create(
            user=User.objects.create_user(
                email='doc2@example.com', full_name='Bimal Shah', phone='9800000403',
                password='pass12345', role='DOCTOR',
            ),
            name='Bimal Shah', specialty='Dermatology',
            consultation_fee=Decimal('1200'), is_verified=True,
        )
        # Every weekday, so a test can pick any date without having to dodge a gap in the pattern.
        for weekday in range(7):
            for doctor in (self.doctor, self.other_doctor):
                DoctorAvailability.objects.create(
                    doctor=doctor, day_of_week=weekday,
                    start_time=time(10, 0), end_time=time(13, 0), slot_duration_minutes=30,
                )
        SystemSetting.objects.update_or_create(key='follow_up_free_days', defaults={'value': '7'})

    # ── helpers ────────────────────────────────────────────────────────────────
    def _completed(self, days_ago=2, doctor=None, **overrides):
        """A past consultation the patient actually had — the thing that grants the entitlement."""
        kwargs = dict(
            user=self.customer, doctor=doctor or self.doctor,
            scheduled_date=date.today() - timedelta(days=days_ago),
            time_slot='10:00', status='COMPLETED',
            fee_amount=Decimal('1500'), fee_charged=Decimal('1500'), payment_status='PAID',
        )
        kwargs.update(overrides)
        return DoctorAppointment.objects.create(**kwargs)

    def _book(self, days_ahead=1, doctor=None, slot='11:00'):
        self.client.force_authenticate(self.customer)
        return self.client.post('/api/doctors/appointments/', {
            'doctor_id': str((doctor or self.doctor).id),
            'scheduled_date': str(date.today() + timedelta(days=days_ahead)),
            'time_slot': slot,
        }, format='json')

    def _slots(self, days_ahead=1, doctor=None, authenticate=True):
        if authenticate:
            self.client.force_authenticate(self.customer)
        target = date.today() + timedelta(days=days_ahead)
        return self.client.get(f'/api/doctors/{(doctor or self.doctor).id}/slots/', {'date': str(target)})

    # ── the entitlement itself ─────────────────────────────────────────────────
    def test_return_visit_inside_window_is_free_and_confirmed(self):
        source = self._completed(days_ago=2)
        res = self._book(days_ahead=1)

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertTrue(appt.is_follow_up_free)
        self.assertFalse(appt.is_plus_free)
        self.assertEqual(appt.follow_up_of_id, source.id)
        self.assertEqual(appt.fee_charged, Decimal('0'))
        self.assertEqual(appt.payment_status, 'NOT_REQUIRED')
        # Nothing to pay means nothing to wait for — it confirms at booking, like a Plus-free one.
        self.assertEqual(appt.status, 'CONFIRMED')

    def test_window_is_measured_to_the_appointment_not_to_today(self):
        """Still inside the window today, but booking a slot beyond its end is charged.

        This is the limit that stops a patient booking months ahead on their last free day.
        """
        self._completed(days_ago=6)  # window ends tomorrow
        res = self._book(days_ahead=10)

        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertFalse(appt.is_follow_up_free)
        self.assertEqual(appt.fee_charged, Decimal('1500'))
        self.assertEqual(appt.payment_status, 'PENDING')
        self.assertEqual(appt.status, 'PENDING')
        # Not linked either — a visit past the window isn't a follow-up of anything.
        self.assertIsNone(appt.follow_up_of_id)

    def test_consultation_older_than_the_window_grants_nothing(self):
        self._completed(days_ago=30)
        res = self._book(days_ahead=1)

        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertFalse(appt.is_follow_up_free)
        self.assertIsNone(appt.follow_up_of_id)
        self.assertEqual(appt.fee_charged, Decimal('1500'))

    def test_only_one_free_follow_up_per_consultation(self):
        self._completed(days_ago=2)
        first = DoctorAppointment.objects.get(id=self._book(days_ahead=1).data['data']['appointment']['id'])
        second = DoctorAppointment.objects.get(id=self._book(days_ahead=2, slot='11:30').data['data']['appointment']['id'])

        self.assertTrue(first.is_follow_up_free)
        self.assertFalse(second.is_follow_up_free)
        self.assertEqual(second.fee_charged, Decimal('1500'))

    def test_cancelling_a_free_follow_up_releases_the_entitlement(self):
        self._completed(days_ago=2)
        first = DoctorAppointment.objects.get(id=self._book(days_ahead=1).data['data']['appointment']['id'])
        self.assertTrue(first.is_follow_up_free)

        first.status = 'CANCELLED'
        first.save(update_fields=['status'])

        replacement = DoctorAppointment.objects.get(id=self._book(days_ahead=2, slot='11:30').data['data']['appointment']['id'])
        self.assertTrue(replacement.is_follow_up_free)
        self.assertEqual(replacement.fee_charged, Decimal('0'))

    def test_a_free_follow_up_cannot_source_another(self):
        """Otherwise the chain renews itself and the consultation is free forever."""
        self._completed(days_ago=2)
        first = DoctorAppointment.objects.get(id=self._book(days_ahead=1).data['data']['appointment']['id'])
        first.status = 'COMPLETED'
        first.save(update_fields=['status'])

        next_visit = DoctorAppointment.objects.get(id=self._book(days_ahead=2, slot='11:30').data['data']['appointment']['id'])
        self.assertFalse(next_visit.is_follow_up_free)
        self.assertEqual(next_visit.fee_charged, Decimal('1500'))

    def test_entitlement_does_not_transfer_to_another_doctor(self):
        self._completed(days_ago=2, doctor=self.doctor)
        res = self._book(days_ahead=1, doctor=self.other_doctor)

        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertFalse(appt.is_follow_up_free)
        self.assertEqual(appt.fee_charged, Decimal('1200'))

    def test_an_appointment_that_never_happened_grants_nothing(self):
        self._completed(days_ago=2, status='CANCELLED')
        res = self._book(days_ahead=1)

        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertFalse(appt.is_follow_up_free)
        self.assertEqual(appt.fee_charged, Decimal('1500'))

    def test_window_of_zero_days_switches_the_entitlement_off(self):
        SystemSetting.objects.update_or_create(key='follow_up_free_days', defaults={'value': '0'})
        self._completed(days_ago=1)
        res = self._book(days_ahead=1)

        appt = DoctorAppointment.objects.get(id=res.data['data']['appointment']['id'])
        self.assertFalse(appt.is_follow_up_free)
        self.assertEqual(appt.fee_charged, Decimal('1500'))

    # ── interaction with Plus ──────────────────────────────────────────────────
    def test_plus_member_keeps_their_follow_up_entitlement_unspent(self):
        """A Plus booking is already free, so charging it to the follow-up entitlement would
        quietly cost the member the one they could have used later."""
        plan = PlusPlan.objects.create(name='Plus', price=Decimal('999'), duration_days=365)
        PlusBenefit.objects.create(plan=plan, key='FREE_DOCTOR_CONSULTATION', description='Free consultations')
        PlusMembership.objects.create(
            user=self.customer, plan=plan, price_paid=Decimal('999'),
            expires_at=timezone.now() + timedelta(days=364),
        )
        source = self._completed(days_ago=2)
        appt = DoctorAppointment.objects.get(id=self._book(days_ahead=1).data['data']['appointment']['id'])

        self.assertTrue(appt.is_plus_free)
        self.assertFalse(appt.is_follow_up_free)
        # Recorded as a follow-up for reporting, but the entitlement itself is untouched...
        self.assertEqual(appt.follow_up_of_id, source.id)
        appt.status = 'CANCELLED'   # ...so it's still there once Plus is out of the picture.
        appt.save(update_fields=['status'])
        PlusMembership.objects.filter(user=self.customer).delete()

        later = DoctorAppointment.objects.get(id=self._book(days_ahead=2, slot='11:30').data['data']['appointment']['id'])
        self.assertTrue(later.is_follow_up_free)

    # ── the doctor is still paid ───────────────────────────────────────────────
    def test_doctor_is_paid_in_full_for_a_free_follow_up(self):
        self._completed(days_ago=2)
        appt = DoctorAppointment.objects.get(id=self._book(days_ahead=1).data['data']['appointment']['id'])
        self.assertEqual(appt.fee_charged, Decimal('0'))

        self.client.force_authenticate(self.doctor_user)
        res = self.client.post(f'/api/doctor/appointments/{appt.id}/complete/', {
            'notes': 'Recovering well.',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        payout = DoctorPayout.objects.get(appointment=appt)
        # Patient paid nothing; the doctor's share is still computed off their real fee, exactly as
        # it is for a Plus-free consultation. Swasthaya absorbs the difference.
        self.assertEqual(payout.gross_amount, Decimal('1500'))
        self.assertEqual(payout.net_payable, Decimal('1500') - payout.commission_amount)

    # ── what the patient is told before they book ──────────────────────────────
    def test_slots_endpoint_reports_eligibility_per_date(self):
        source = self._completed(days_ago=6)  # window ends tomorrow

        inside = self._slots(days_ahead=1).data['data']['follow_up_free']
        self.assertTrue(inside['eligible'])
        self.assertEqual(inside['window_days'], 7)
        self.assertEqual(inside['previous_consultation_date'], source.scheduled_date)
        self.assertEqual(inside['expires_on'], source.scheduled_date + timedelta(days=7))

        # Same patient, same doctor, a date past the window — the answer has to change with it.
        outside = self._slots(days_ahead=10).data['data']['follow_up_free']
        self.assertFalse(outside['eligible'])
        self.assertNotIn('expires_on', outside)

    def test_slots_endpoint_is_safe_for_a_signed_out_visitor(self):
        self._completed(days_ago=2)
        res = self._slots(days_ahead=1, authenticate=False)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['data']['follow_up_free']['eligible'])
        self.assertTrue(res.data['data']['slots'])
