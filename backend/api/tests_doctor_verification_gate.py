"""Item 5d — an unverified doctor must not be reachable for consultations.

`Doctor.is_verified` defaults to False, and the admin verify toggle's UI copy promises "they can now
accept appointments" — but until this gate existed nothing honoured it: an unverified doctor was
publicly listed, bookable, and could confirm consultations. These tests pin the gate on every entry
point (list, specialties, detail, slots, booking creation, and the doctor's own confirm) while
leaving internal paths — _confirm_appointment on a legacy row, admin actions — untouched.
"""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, Doctor, DoctorAvailability, DoctorAppointment


class DoctorVerificationGateTests(APITestCase):
    def setUp(self):
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000601', password='pass12345',
        )
        self.verified = self._doctor('Vera Fide', 'verified@example.com', '9800000602', verified=True, license='NMC-2001')
        self.unverified = self._doctor('Una Verified', 'unverified@example.com', '9800000603', verified=False, license='NMC-2002')

    def _doctor(self, name, email, phone, *, verified, license):
        user = User.objects.create_user(email=email, full_name=name, phone=phone, password='pass12345', role='DOCTOR')
        doctor = Doctor.objects.create(
            user=user, name=name, specialty='Cardiology' if verified else 'Neurology',
            consultation_fee=Decimal('1500'), is_active=True, is_verified=verified, license_number=license,
        )
        for weekday in range(7):
            DoctorAvailability.objects.create(
                doctor=doctor, day_of_week=weekday,
                start_time=time(10, 0), end_time=time(17, 0), slot_duration_minutes=30,
            )
        return doctor

    # ── public listing ──────────────────────────────────────────────────────────
    def test_listing_shows_verified_and_hides_unverified(self):
        res = self.client.get('/api/doctors/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = {d['id'] for d in res.data['data']['doctors']}
        self.assertIn(str(self.verified.id), ids)
        self.assertNotIn(str(self.unverified.id), ids)

    def test_specialty_list_omits_the_unverified_doctors_specialty(self):
        res = self.client.get('/api/doctors/specialties/')
        specialties = res.data['data']['specialties']
        self.assertIn('Cardiology', specialties)      # the verified doctor's
        self.assertNotIn('Neurology', specialties)    # only the unverified doctor has this

    # ── detail & slots ──────────────────────────────────────────────────────────
    def test_verified_doctor_detail_is_reachable(self):
        res = self.client.get(f'/api/doctors/{self.verified.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unverified_doctor_detail_is_not_found(self):
        res = self.client.get(f'/api/doctors/{self.unverified.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_unverified_doctor_slots_is_not_found(self):
        target = date.today() + timedelta(days=1)
        res = self.client.get(f'/api/doctors/{self.unverified.id}/slots/', {'date': str(target)})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ── booking creation ─────────────────────────────────────────────────────────
    def test_a_verified_doctor_can_be_booked(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/doctors/appointments/', {
            'doctor_id': str(self.verified.id),
            'scheduled_date': str(date.today() + timedelta(days=1)),
            'time_slot': '11:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_an_unverified_doctor_cannot_be_booked(self):
        self.client.force_authenticate(self.customer)
        res = self.client.post('/api/doctors/appointments/', {
            'doctor_id': str(self.unverified.id),
            'scheduled_date': str(date.today() + timedelta(days=1)),
            'time_slot': '11:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(DoctorAppointment.objects.filter(doctor=self.unverified).exists())

    # ── the doctor's own confirm path ────────────────────────────────────────────
    def test_an_unverified_doctor_cannot_confirm_an_appointment(self):
        # A pending appointment can exist on an unverified doctor (e.g. verification was revoked
        # after booking, or the row was made by an admin). Confirming is "accepting" the consult —
        # exactly what verification gates — so it must be refused.
        appt = DoctorAppointment.objects.create(
            user=self.customer, doctor=self.unverified,
            scheduled_date=date.today() + timedelta(days=1), time_slot='11:00',
            status='PENDING', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='NOT_REQUIRED',
        )
        self.client.force_authenticate(self.unverified.user)
        res = self.client.post(f'/api/doctor/appointments/{appt.id}/confirm/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'PENDING')

    def test_a_verified_doctor_can_confirm_an_appointment(self):
        appt = DoctorAppointment.objects.create(
            user=self.customer, doctor=self.verified,
            scheduled_date=date.today() + timedelta(days=1), time_slot='11:00',
            status='PENDING', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='NOT_REQUIRED',
        )
        self.client.force_authenticate(self.verified.user)
        res = self.client.post(f'/api/doctor/appointments/{appt.id}/confirm/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'CONFIRMED')
