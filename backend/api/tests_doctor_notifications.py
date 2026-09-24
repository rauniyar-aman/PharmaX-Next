"""Verification suite for the three doctor-facing notification gaps closed in this change.

Until now a doctor was the only party in the system nobody ever told anything:
  1. An admin created the login and typed a password — nothing ever reached the doctor.
  2. A patient booked a consultation — the patient and the admins were notified, the doctor was not.
  3. There was no bell or notifications screen in the doctor area at all (frontend, not covered here).

These tests pin the backend halves of 1 and 2. Run with
`python manage.py test api.tests_doctor_notifications` against a throwaway test database.

Outbound mail is mocked at the two async senders so nothing is actually sent, but the mocks are
asserted on: the welcome email is the ONLY place the admin-set password is allowed to appear, and
the persistent in-app Notification row must never carry it (it lives in the DB and shows on every
future login). That split is the whole point of having both, so it is tested, not assumed.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, Doctor, DoctorAppointment, Notification
from .views import _confirm_appointment


class DoctorNotificationTests(APITestCase):
    def setUp(self):
        # Two separate seams: _send_email_async carries the welcome email (asserted on below),
        # _send_notification_email_async is the fan-out behind notify_user/_notify_admins. Both are
        # threads in production; mocking them keeps the suite synchronous and offline.
        self.mail = mock.patch('api.utils._send_email_async').start()
        self.notif_mail = mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000201', password='pass12345',
            role='ADMIN', is_super_admin=True,
        )
        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000202', password='pass12345',
        )

    # ── helpers ────────────────────────────────────────────────────────────────
    def _create_doctor_payload(self, **overrides):
        body = {
            'name': 'Asha Rai', 'specialty': 'Cardiology', 'consultation_fee': '1500',
            'email': 'asha@example.com', 'phone': '9800000203', 'password': 'Temp#Pass123',
            'license_number': 'NMC-1001',
        }
        body.update(overrides)
        return body

    def _welcome_email_bodies(self):
        """(text_body, html_body) of the single welcome email that was sent."""
        self.assertEqual(self.mail.call_count, 1, 'expected exactly one welcome email')
        _to, _subject, html_body, text_body = self.mail.call_args.args[:4]
        return text_body, html_body

    def _booked_appointment(self, doctor, **overrides):
        kwargs = dict(
            user=self.customer, doctor=doctor, scheduled_date=date.today() + timedelta(days=3),
            time_slot='10:00 AM - 10:30 AM', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PAID', status='PENDING',
        )
        kwargs.update(overrides)
        return DoctorAppointment.objects.create(**kwargs)

    def _doctor_notifs(self, user):
        return Notification.objects.filter(user=user, title='New Appointment Booked')

    # ── 1. account creation ────────────────────────────────────────────────────
    def test_created_doctor_is_told_the_account_exists(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/admin/doctors/', self._create_doctor_payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        doc_user = User.objects.get(email='asha@example.com')
        notif = Notification.objects.get(user=doc_user, type='ACCOUNT_UPDATE')
        self.assertEqual(notif.title, 'Your doctor account is ready')
        self.assertEqual(notif.link, '/doctor/dashboard')
        # The password must never be in a row that persists in the DB.
        self.assertNotIn('Temp#Pass123', notif.message)
        # An admin-created doctor starts unverified, so the row has to say the account is gated —
        # otherwise the doctor signs in, finds everything locked, and has no idea why.
        self.assertIn('verif', notif.message.lower())

    def test_welcome_email_is_the_only_place_the_password_appears(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post('/api/admin/doctors/', self._create_doctor_payload(), format='json')

        text_body, html_body = self._welcome_email_bodies()
        to_email = self.mail.call_args.args[0]
        self.assertEqual(to_email, 'asha@example.com')
        self.assertIn('Temp#Pass123', text_body)
        self.assertIn('Temp#Pass123', html_body)
        self.assertIn('asha@example.com', text_body)
        self.assertIn('verified by our team', text_body)

    def test_failed_creation_notifies_nobody(self):
        # A duplicate licence is rejected by the serializer before anything is created; the welcome
        # pair sits after the atomic block precisely so a rejected or rolled-back create is silent.
        Doctor.objects.create(name='Existing', specialty='ENT', consultation_fee=Decimal('900'), license_number='NMC-1001')
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/admin/doctors/', self._create_doctor_payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.mail.call_count, 0)
        self.assertFalse(Notification.objects.filter(type='ACCOUNT_UPDATE').exists())

    # ── 2. legacy doctor getting a first login ─────────────────────────────────
    def test_linked_legacy_doctor_is_told_too(self):
        legacy = Doctor.objects.create(
            name='Bikash Thapa', specialty='Dermatology', consultation_fee=Decimal('1200'),
            license_number='NMC-1002', is_active=True,
        )
        self.assertIsNone(legacy.user_id)

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/admin/doctors/{legacy.id}/link-account/', {
            'full_name': 'Bikash Thapa', 'email': 'bikash@example.com',
            'phone': '9800000204', 'password': 'Link#Pass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        doc_user = User.objects.get(email='bikash@example.com')
        notif = Notification.objects.get(user=doc_user, type='ACCOUNT_UPDATE')
        self.assertEqual(notif.link, '/doctor/dashboard')
        self.assertNotIn('Link#Pass123', notif.message)

        text_body, _html = self._welcome_email_bodies()
        self.assertIn('Link#Pass123', text_body)

    def test_relinking_an_already_linked_doctor_notifies_nobody(self):
        user = User.objects.create_user(
            email='taken@example.com', full_name='Taken', phone='9800000205', password='pass12345', role='DOCTOR',
        )
        doctor = Doctor.objects.create(
            user=user, name='Taken', specialty='ENT', consultation_fee=Decimal('800'), license_number='NMC-1003',
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/admin/doctors/{doctor.id}/link-account/', {
            'full_name': 'Someone Else', 'email': 'else@example.com',
            'phone': '9800000206', 'password': 'Other#Pass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.mail.call_count, 0)

    # ── 3. booking confirmation ────────────────────────────────────────────────
    def test_confirming_a_booking_notifies_the_doctor(self):
        doc_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000207', password='pass12345', role='DOCTOR',
        )
        doctor = Doctor.objects.create(
            user=doc_user, name='Asha Rai', specialty='Cardiology', consultation_fee=Decimal('1500'),
            license_number='NMC-1004', is_active=True, is_verified=True,
        )
        appt = self._booked_appointment(doctor, reason='Chest pain')
        _confirm_appointment(appt)

        notif = self._doctor_notifs(doc_user).get()
        self.assertEqual(notif.type, 'APPOINTMENT_UPDATE')
        self.assertEqual(notif.link, '/doctor/appointments')
        self.assertIn('Cust Omer', notif.message)
        self.assertIn('10:00 AM - 10:30 AM', notif.message)
        self.assertIn('Chest pain', notif.message)
        # What the patient paid is not the doctor's share — that's DoctorPayout's job, so the fee
        # is deliberately absent from the doctor's copy.
        self.assertNotIn('1500', notif.message)

        # The two pre-existing recipients must be unaffected.
        self.assertTrue(Notification.objects.filter(user=self.customer, title='Appointment Confirmed').exists())
        self.assertTrue(Notification.objects.filter(user=self.admin, type='NEW_APPOINTMENT').exists())

    def test_doctor_without_a_login_is_skipped_not_crashed(self):
        legacy = Doctor.objects.create(
            name='Legacy Doc', specialty='ENT', consultation_fee=Decimal('900'),
            license_number='NMC-1005', is_active=True,
        )
        appt = self._booked_appointment(legacy)
        _confirm_appointment(appt)  # must not raise — Doctor.user is null on the legacy rows

        appt.refresh_from_db()
        self.assertEqual(appt.status, 'CONFIRMED')
        self.assertFalse(Notification.objects.filter(title='New Appointment Booked').exists())
        self.assertTrue(Notification.objects.filter(user=self.customer, title='Appointment Confirmed').exists())

    def test_reconfirming_does_not_notify_the_doctor_twice(self):
        doc_user = User.objects.create_user(
            email='doc2@example.com', full_name='Bina Shah', phone='9800000208', password='pass12345', role='DOCTOR',
        )
        doctor = Doctor.objects.create(
            user=doc_user, name='Bina Shah', specialty='Pediatrics', consultation_fee=Decimal('1100'),
            license_number='NMC-1006', is_active=True, is_verified=True,
        )
        appt = self._booked_appointment(doctor)
        _confirm_appointment(appt)
        _confirm_appointment(appt)  # Khalti can redirect twice; the PENDING guard absorbs it

        self.assertEqual(self._doctor_notifs(doc_user).count(), 1)

    def test_plus_free_booking_still_reaches_the_doctor(self):
        # A Plus-free consultation confirms at booking time rather than after payment — a different
        # call site into the same function, and the doctor still has to show up for it.
        doc_user = User.objects.create_user(
            email='doc3@example.com', full_name='Chandra Giri', phone='9800000209', password='pass12345', role='DOCTOR',
        )
        doctor = Doctor.objects.create(
            user=doc_user, name='Chandra Giri', specialty='General', consultation_fee=Decimal('1000'),
            license_number='NMC-1007', is_active=True, is_verified=True,
        )
        appt = self._booked_appointment(
            doctor, payment_status='NOT_REQUIRED', is_plus_free=True, fee_charged=Decimal('0'),
        )
        _confirm_appointment(appt)
        self.assertEqual(self._doctor_notifs(doc_user).count(), 1)
