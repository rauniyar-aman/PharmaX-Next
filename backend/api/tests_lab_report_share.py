"""Verification suite for the lab-report loop between a patient and the doctor who ordered the test.

Two gaps are closed here, and they pull in opposite directions, which is why they are tested together:

  * A doctor suggests a test during a consultation and then hears nothing — they never learn whether
    the patient actually booked it. Confirming the booking now tells them.
  * A finished report belongs to the patient, not to whoever ordered the test. So the report does NOT
    flow back automatically: the patient sends it, and can take it back. The ordering doctor gets a
    prompt, not access.

The privacy half is the part worth pinning down, because the tempting shortcut — "the doctor ordered
it, so show them the result" — is exactly what DoctorPatientDetailView's contract forbids ("never
anything from the patient's account beyond what happened with THIS doctor"). These tests assert the
doctor sees nothing until the patient shares, and nothing again once they revoke.

Run with `python manage.py test api.tests_lab_report_share` against a throwaway test database.
Outbound mail is mocked at both async senders; nothing leaves the machine.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    User, Doctor, DoctorAppointment, LabTest, LabTestCategory, LabTestBooking,
    LabReportShare, Notification, Prescription, PrescriptionLabTestItem,
)
from .views import _confirm_lab_test_booking, _upload_lab_report


class LabReportShareTests(APITestCase):
    def setUp(self):
        mock.patch('api.utils._send_email_async').start()
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.patient = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000301', password='pass12345',
        )
        self.category = LabTestCategory.objects.create(name='Blood')
        self.lab_test = LabTest.objects.create(
            name='Complete Blood Count', category=self.category,
            price=Decimal('800'), original_price=Decimal('1000'),
        )
        self.doctor, self.doctor_user = self._doctor('Asha Rai', 'asha@example.com', '9800000302', 'NMC-2001')

    # ── helpers ────────────────────────────────────────────────────────────────
    def _doctor(self, name, email, phone, license_number):
        user = User.objects.create_user(
            email=email, full_name=name, phone=phone, password='pass12345', role='DOCTOR',
        )
        doctor = Doctor.objects.create(
            user=user, name=name, specialty='Cardiology', consultation_fee=Decimal('1500'),
            license_number=license_number, is_active=True, is_verified=True,
        )
        return doctor, user

    def _consultation(self, doctor):
        """A past consultation — the thing that makes a doctor eligible to receive a share."""
        return DoctorAppointment.objects.create(
            user=self.patient, doctor=doctor, scheduled_date=date.today() - timedelta(days=2),
            time_slot='10:00 AM - 10:30 AM', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PAID', status='COMPLETED',
        )

    def _booking(self, **overrides):
        kwargs = dict(
            user=self.patient, lab_test=self.lab_test, scheduled_date=date.today() + timedelta(days=2),
            time_slot='7:00 AM - 9:00 AM', total_amount=Decimal('800'), status='PENDING',
        )
        kwargs.update(overrides)
        return LabTestBooking.objects.create(**kwargs)

    def _ordered_booking(self, doctor, **overrides):
        """A booking the patient made from a doctor's suggested-tests list — the prescription item is
        the only link back to the ordering doctor, exactly as LabTestBookingListCreateView sets it."""
        booking = self._booking(**overrides)
        appointment = self._consultation(doctor)
        prescription = Prescription.objects.create(
            user=self.patient, source='CONSULTATION', appointment=appointment, status='VERIFIED',
        )
        PrescriptionLabTestItem.objects.create(
            prescription=prescription, lab_test=self.lab_test, added_by=doctor.user, booking=booking,
        )
        return booking

    def _attach_report(self, booking):
        booking.status = 'SAMPLE_COLLECTED'
        booking.payment_status = 'PAID'
        booking.save(update_fields=['status', 'payment_status'])
        ok, err = _upload_lab_report(booking, SimpleUploadedFile('cbc.pdf', b'%PDF-1.4 report', 'application/pdf'))
        self.assertTrue(ok, err)
        booking.refresh_from_db()
        return booking

    def _share_url(self, booking):
        return f'/api/lab-tests/bookings/{booking.id}/share-report/'

    def _doctor_notifs(self, user, title):
        return Notification.objects.filter(user=user, title=title)

    # ── the doctor learns the test was booked ──────────────────────────────────
    def test_confirming_an_ordered_booking_notifies_the_ordering_doctor(self):
        booking = self._ordered_booking(self.doctor)
        _confirm_lab_test_booking(booking)

        notif = self._doctor_notifs(self.doctor_user, 'Patient Booked a Test You Ordered').get()
        self.assertEqual(notif.type, 'LAB_BOOKING_UPDATE')
        self.assertEqual(notif.link, f'/doctor/patients/{self.patient.id}')
        self.assertIn('Cust Omer', notif.message)
        self.assertIn('Complete Blood Count', notif.message)

    def test_self_booked_test_notifies_no_doctor(self):
        # No prescription item, so no ordering doctor — the patient booked this off their own bat.
        _confirm_lab_test_booking(self._booking())
        self.assertFalse(Notification.objects.filter(title='Patient Booked a Test You Ordered').exists())

    def test_cart_checkout_still_reaches_the_doctor(self):
        # notify=False collapses the customer/admin fan-out for a multi-test checkout. The doctor has
        # no aggregated equivalent, so their notification must survive the flag.
        booking = self._ordered_booking(self.doctor)
        _confirm_lab_test_booking(booking, notify=False)

        self.assertEqual(self._doctor_notifs(self.doctor_user, 'Patient Booked a Test You Ordered').count(), 1)
        self.assertFalse(Notification.objects.filter(user=self.patient, type='LAB_BOOKING_UPDATE').exists())

    def test_reconfirming_does_not_notify_the_doctor_twice(self):
        booking = self._ordered_booking(self.doctor)
        _confirm_lab_test_booking(booking)
        _confirm_lab_test_booking(booking)  # a gateway can redirect twice
        self.assertEqual(self._doctor_notifs(self.doctor_user, 'Patient Booked a Test You Ordered').count(), 1)

    def test_ordering_doctor_without_a_login_is_skipped_not_crashed(self):
        legacy = Doctor.objects.create(
            name='Legacy Doc', specialty='ENT', consultation_fee=Decimal('900'), license_number='NMC-2002',
        )
        booking = self._ordered_booking(legacy)
        _confirm_lab_test_booking(booking)  # must not raise — Doctor.user is null on legacy rows

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'CONFIRMED')
        self.assertFalse(Notification.objects.filter(title='Patient Booked a Test You Ordered').exists())

    # ── the report-ready prompt ────────────────────────────────────────────────
    def test_report_ready_row_points_the_patient_at_the_ordering_doctor(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        notif = Notification.objects.filter(user=self.patient, title='Report Ready').get()
        self.assertIn('Dr. Asha Rai', notif.message)
        self.assertIn('send them the report', notif.message)
        # A prompt only — the doctor is told nothing and gets nothing until the patient acts.
        self.assertFalse(LabReportShare.objects.exists())
        self.assertFalse(self._doctor_notifs(self.doctor_user, 'Lab Report Shared With You').exists())

    def test_self_booked_report_ready_row_has_no_share_hint(self):
        self._attach_report(self._booking())
        notif = Notification.objects.filter(user=self.patient, title='Report Ready').get()
        self.assertNotIn('ordered this test', notif.message)

    # ── who the report can be sent to ──────────────────────────────────────────
    def test_share_targets_are_the_doctors_this_patient_has_consulted(self):
        other, _other_user = self._doctor('Bina Shah', 'bina@example.com', '9800000303', 'NMC-2003')
        self._consultation(other)
        stranger, _stranger_user = self._doctor('Never Met', 'never@example.com', '9800000304', 'NMC-2004')
        legacy = Doctor.objects.create(
            name='No Login', specialty='ENT', consultation_fee=Decimal('900'), license_number='NMC-2005',
        )
        DoctorAppointment.objects.create(
            user=self.patient, doctor=legacy, scheduled_date=date.today() - timedelta(days=5),
            time_slot='9:00 AM - 9:30 AM', fee_amount=Decimal('900'), fee_charged=Decimal('900'),
            payment_status='PAID', status='COMPLETED',
        )
        booking = self._attach_report(self._ordered_booking(self.doctor))

        self.client.force_authenticate(user=self.patient)
        res = self.client.get(self._share_url(booking))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data['data']
        self.assertTrue(data['report_ready'])

        names = [d['name'] for d in data['doctors']]
        self.assertIn('Asha Rai', names)
        self.assertIn('Bina Shah', names)
        self.assertNotIn(stranger.name, names)   # never consulted
        self.assertNotIn(legacy.name, names)     # consulted, but has nowhere to receive a share
        ordered = [d['name'] for d in data['doctors'] if d['ordered_this_test']]
        self.assertEqual(ordered, ['Asha Rai'])

    def test_another_users_booking_is_not_visible(self):
        stranger = User.objects.create_user(
            email='stranger@example.com', full_name='Stran Ger', phone='9800000305', password='pass12345',
        )
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=stranger)
        self.assertEqual(self.client.get(self._share_url(booking)).status_code, status.HTTP_404_NOT_FOUND)
        res = self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ── sending ────────────────────────────────────────────────────────────────
    def test_sharing_a_report_notifies_the_doctor_once(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=self.patient)

        res = self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(len(res.data['data']['shares']), 1)

        notif = self._doctor_notifs(self.doctor_user, 'Lab Report Shared With You').get()
        self.assertEqual(notif.link, f'/doctor/patients/{self.patient.id}')
        self.assertIn('Complete Blood Count', notif.message)

        # Tapping "Send" twice is one share and one notification, not two.
        again = self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(LabReportShare.objects.filter(booking=booking).count(), 1)
        self.assertEqual(self._doctor_notifs(self.doctor_user, 'Lab Report Shared With You').count(), 1)

    def test_cannot_send_to_a_doctor_never_consulted(self):
        stranger, stranger_user = self._doctor('Never Met', 'never@example.com', '9800000306', 'NMC-2006')
        booking = self._attach_report(self._ordered_booking(self.doctor))

        self.client.force_authenticate(user=self.patient)
        res = self.client.post(self._share_url(booking), {'doctor_id': str(stranger.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LabReportShare.objects.exists())
        self.assertFalse(self._doctor_notifs(stranger_user, 'Lab Report Shared With You').exists())

    def test_cannot_send_a_report_that_does_not_exist_yet(self):
        booking = self._ordered_booking(self.doctor)  # no report uploaded
        self.client.force_authenticate(user=self.patient)
        res = self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(LabReportShare.objects.exists())

    # ── what the doctor actually sees ──────────────────────────────────────────
    def test_doctor_sees_the_report_only_after_it_is_shared(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        detail_url = f'/api/doctor/patients/{self.patient.id}/'

        # Ordered the test, report exists — and still sees nothing, because nothing was shared.
        self.client.force_authenticate(user=self.doctor_user)
        before = self.client.get(detail_url)
        self.assertEqual(before.status_code, status.HTTP_200_OK)
        self.assertEqual(before.data['data']['shared_reports'], [])

        self.client.force_authenticate(user=self.patient)
        self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')

        self.client.force_authenticate(user=self.doctor_user)
        after = self.client.get(detail_url)
        shared = after.data['data']['shared_reports']
        self.assertEqual(len(shared), 1)
        self.assertEqual(shared[0]['lab_test_name'], 'Complete Blood Count')
        self.assertEqual(shared[0]['patient']['full_name'], 'Cust Omer')
        self.assertTrue(shared[0]['report_file_url'])

    def test_a_share_reaches_only_the_doctor_it_was_sent_to(self):
        other, other_user = self._doctor('Bina Shah', 'bina@example.com', '9800000307', 'NMC-2007')
        self._consultation(other)
        booking = self._attach_report(self._ordered_booking(self.doctor))

        self.client.force_authenticate(user=self.patient)
        self.client.post(self._share_url(booking), {'doctor_id': str(other.id)}, format='json')

        # Sent to Bina — so Asha, who ordered the test, still has nothing.
        self.client.force_authenticate(user=self.doctor_user)
        asha = self.client.get(f'/api/doctor/patients/{self.patient.id}/')
        self.assertEqual(asha.data['data']['shared_reports'], [])

        self.client.force_authenticate(user=other_user)
        bina = self.client.get(f'/api/doctor/patients/{self.patient.id}/')
        self.assertEqual(len(bina.data['data']['shared_reports']), 1)

    # ── taking it back ─────────────────────────────────────────────────────────
    def test_revoking_removes_the_doctors_access_silently(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=self.patient)
        self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')

        res = self.client.delete(f'{self._share_url(booking)}?doctor_id={self.doctor.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(LabReportShare.objects.exists())

        self.client.force_authenticate(user=self.doctor_user)
        self.assertEqual(
            self.client.get(f'/api/doctor/patients/{self.patient.id}/').data['data']['shared_reports'], [],
        )
        # Withdrawing is the patient's ordinary business; the doctor is not told, so there is nothing
        # for them to ask about. Only the original share notification remains.
        self.assertEqual(self._doctor_notifs(self.doctor_user, 'Lab Report Shared With You').count(), 1)

    def test_revoking_something_not_shared_is_a_404(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=self.patient)
        res = self.client.delete(f'{self._share_url(booking)}?doctor_id={self.doctor.id}')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_resharing_after_a_revoke_notifies_again(self):
        # The revoke deleted the grant, so the next send is genuinely new — the doctor needs telling.
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=self.patient)
        self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')
        self.client.delete(f'{self._share_url(booking)}?doctor_id={self.doctor.id}')
        res = self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self._doctor_notifs(self.doctor_user, 'Lab Report Shared With You').count(), 2)

    # ── the patient's own bookings list ────────────────────────────────────────
    def test_booking_payload_carries_the_ordering_doctor_and_current_shares(self):
        booking = self._attach_report(self._ordered_booking(self.doctor))
        self.client.force_authenticate(user=self.patient)
        self.client.post(self._share_url(booking), {'doctor_id': str(self.doctor.id)}, format='json')

        res = self.client.get('/api/lab-tests/bookings/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        row = next(b for b in res.data['data']['bookings'] if b['id'] == str(booking.id))
        self.assertEqual(row['ordered_by_doctor']['name'], 'Asha Rai')
        self.assertTrue(row['ordered_by_doctor']['has_login'])
        self.assertEqual([s['doctor_name'] for s in row['shared_with']], ['Asha Rai'])

    def test_self_booked_row_has_no_ordering_doctor(self):
        self._attach_report(self._booking())
        self.client.force_authenticate(user=self.patient)
        row = self.client.get('/api/lab-tests/bookings/').data['data']['bookings'][0]
        self.assertIsNone(row['ordered_by_doctor'])
        self.assertEqual(row['shared_with'], [])
