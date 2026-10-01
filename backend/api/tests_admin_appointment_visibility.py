"""Regression suite for the admin's consultation-visibility surface (reported item 10).

The reported question was: "how will the admin know which DOCTOR consulted which CUSTOMER, what
MEDICINES and TESTS were suggested, and what the FOLLOW-UP DATE is?" The answer lives on the
`/admin/appointments/` list, which serializes each appointment through DoctorAppointmentSerializer
with APPOINTMENT_PRESCRIPTION_PREFETCH — so the doctor, the patient, the prescribed medicine names,
the suggested lab-test names and the follow-up date/notes all have to come back on the one call.

That behaviour was implemented but had no direct test, so a refactor of the serializer's
get_prescription (or of the prefetch) could quietly drop a field and nobody would notice until a
support agent opened the screen. These tests pin the exact fields the screen depends on — by name,
not by count — plus the two rules that are easy to break: the endpoint is manage_doctors-only, and
an appointment with no prescription still lists (it just carries a null prescription).

Run with `python manage.py test api.tests_admin_appointment_visibility` against a throwaway test
database. Outbound mail is mocked; nothing leaves the machine.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    User, Doctor, DoctorAppointment, Prescription, PrescriptionMedicineItem,
    PrescriptionLabTestItem, Medicine, Category, Brand, LabTest, LabTestCategory,
)


class AdminAppointmentVisibilityTests(APITestCase):
    def setUp(self):
        # notify_* / meeting-link paths can fan out to email on a thread; keep the suite offline.
        mock.patch('api.utils._send_email_async').start()
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000001',
            password='pass12345', role='ADMIN', is_super_admin=True,
        )
        self.patient = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000002', password='pass12345',
        )
        doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Dr House', phone='9800000003',
            password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=doctor_user, name='Gregory House', specialty='Diagnostics',
            consultation_fee=Decimal('1000'), license_number='NMC-VIS-1', is_verified=True,
        )

        med_category = Category.objects.create(name='Tablets')
        brand = Brand.objects.create(name='Acme')
        self.medicine = Medicine.objects.create(
            name='Paracetamol 500mg', category=med_category, brand=brand,
            price=Decimal('25'), original_price=Decimal('30'), stock_quantity=100,
        )
        lab_category = LabTestCategory.objects.create(name='Haematology')
        self.lab_test = LabTest.objects.create(
            name='Complete Blood Count', category=lab_category,
            price=Decimal('800'), original_price=Decimal('1000'),
        )

    # ── helpers ──────────────────────────────────────────────────────────────────
    def _appointment(self, **overrides):
        kwargs = dict(
            user=self.patient, doctor=self.doctor,
            scheduled_date=date.today() + timedelta(days=1), time_slot='10:00',
            status='COMPLETED', fee_amount=Decimal('1000'),
        )
        kwargs.update(overrides)
        return DoctorAppointment.objects.create(**kwargs)

    def _prescription_for(self, appt, *, medicines=True, lab_tests=True):
        presc = Prescription.objects.create(user=self.patient, appointment=appt, status='VERIFIED', notes='Rest and fluids.')
        if medicines:
            PrescriptionMedicineItem.objects.create(prescription=presc, medicine=self.medicine, quantity=2, added_by=self.doctor.user)
        if lab_tests:
            PrescriptionLabTestItem.objects.create(prescription=presc, lab_test=self.lab_test, added_by=self.doctor.user)
        return presc

    def _list(self, as_user=None):
        self.client.force_authenticate(user=as_user or self.admin)
        res = self.client.get('/api/admin/appointments/')
        return res

    def _row_for(self, res, appt):
        for row in res.data['data']['appointments']:
            if row['id'] == str(appt.id):
                return row
        self.fail(f'appointment {appt.id} not in the admin list')

    # ── the reported fields ────────────────────────────────────────────────────────
    def test_list_names_the_doctor_and_the_patient(self):
        appt = self._appointment()
        res = self._list()
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row = self._row_for(res, appt)
        self.assertEqual(row['doctor']['name'], 'Gregory House')
        self.assertEqual(row['user']['full_name'], 'Cust Omer')
        self.assertEqual(row['user']['email'], 'patient@example.com')

    def test_list_carries_prescribed_medicine_names_not_just_counts(self):
        appt = self._appointment()
        self._prescription_for(appt, lab_tests=False)
        row = self._row_for(self._list(), appt)
        names = [m['name'] for m in row['prescription']['medicines']]
        self.assertIn('Paracetamol 500mg', names)
        self.assertEqual(row['prescription']['medicine_item_count'], 1)

    def test_list_carries_suggested_lab_test_names(self):
        appt = self._appointment()
        self._prescription_for(appt, medicines=False)
        row = self._row_for(self._list(), appt)
        names = [t['name'] for t in row['prescription']['lab_tests']]
        self.assertIn('Complete Blood Count', names)
        self.assertEqual(row['prescription']['lab_test_item_count'], 1)

    def test_list_carries_the_follow_up_date_and_notes(self):
        follow_up = date.today() + timedelta(days=14)
        appt = self._appointment(follow_up_date=follow_up, follow_up_notes='Recheck bloods in two weeks.')
        row = self._row_for(self._list(), appt)
        self.assertEqual(row['follow_up_date'], follow_up.isoformat())
        self.assertEqual(row['follow_up_notes'], 'Recheck bloods in two weeks.')

    def test_one_call_shows_medicines_and_lab_tests_together(self):
        appt = self._appointment()
        self._prescription_for(appt)  # both
        row = self._row_for(self._list(), appt)
        self.assertEqual([m['name'] for m in row['prescription']['medicines']], ['Paracetamol 500mg'])
        self.assertEqual([t['name'] for t in row['prescription']['lab_tests']], ['Complete Blood Count'])

    # ── the rules that are easy to break ─────────────────────────────────────────────
    def test_an_appointment_without_a_prescription_still_lists(self):
        appt = self._appointment(status='CONFIRMED')
        row = self._row_for(self._list(), appt)
        # A booked-but-not-yet-consulted appointment has no prescription; it must still appear, just
        # with a null prescription, so the admin sees the whole book — not only completed ones.
        self.assertIsNone(row['prescription'])

    def test_the_list_is_restricted_to_manage_doctors(self):
        self.client.force_authenticate(user=self.patient)
        res = self.client.get('/api/admin/appointments/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_the_list_requires_authentication(self):
        res = self.client.get('/api/admin/appointments/')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
