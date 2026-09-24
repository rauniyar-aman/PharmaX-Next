"""Lab tests on an admin-curated (patient-uploaded) prescription.

An uploaded prescription routinely names lab tests as well as medicines, but the admin curation
screen could only transcribe medicines — any test written on the paper was simply lost. The
PrescriptionLabTestItem model, its serializer and the patient's review screen already existed for
doctor-issued prescriptions; what is pinned here is the admin half now feeding that same funnel,
and the curated tests actually reaching the patient once the prescription is verified.

Run with `python manage.py test api.tests_admin_prescription_lab_tests`.
"""
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    User, Prescription, PrescriptionMedicineItem, PrescriptionLabTestItem,
    LabTest, LabTestCategory, Category, Brand, Medicine, Notification,
)


class AdminPrescriptionLabTestItemTests(APITestCase):
    def setUp(self):
        # notify_user fans out to email on a thread; keep the suite offline.
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000401',
            password='pass12345', role='ADMIN', is_super_admin=True,
        )
        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000402', password='pass12345',
        )

        lab_category = LabTestCategory.objects.create(name='Haematology')
        self.lab_test = LabTest.objects.create(
            name='Complete Blood Count', category=lab_category,
            price=Decimal('800'), original_price=Decimal('1000'),
        )
        self.other_lab_test = LabTest.objects.create(
            name='Lipid Profile', category=lab_category,
            price=Decimal('1200'), original_price=Decimal('1500'),
        )
        self.inactive_lab_test = LabTest.objects.create(
            name='Retired Panel', category=lab_category,
            price=Decimal('500'), original_price=Decimal('500'), is_active=False,
        )

        category = Category.objects.create(name='Tablets')
        brand = Brand.objects.create(name='Acme')
        self.medicine = Medicine.objects.create(
            name='Paracetamol 500mg', category=category, brand=brand,
            price=Decimal('25'), original_price=Decimal('30'), stock_quantity=100,
        )

        self.prescription = Prescription.objects.create(user=self.customer, status='PENDING')

    # ── helpers ────────────────────────────────────────────────────────────────
    def _add(self, lab_test_id, prescription=None, user=None):
        self.client.force_authenticate(user=user or self.admin)
        presc = prescription or self.prescription
        return self.client.post(f'/api/admin/prescriptions/{presc.id}/lab-test-items/',
                                {'lab_test_id': str(lab_test_id)}, format='json')

    def _verify(self, admin_comment=''):
        self.client.force_authenticate(user=self.admin)
        return self.client.put(f'/api/admin/prescriptions/{self.prescription.id}/',
                               {'status': 'VERIFIED', 'admin_comment': admin_comment}, format='json')

    def _patient_notification(self):
        return Notification.objects.get(user=self.customer, type='PRESCRIPTION')

    # ── add ────────────────────────────────────────────────────────────────────
    def test_admin_can_attach_a_lab_test_to_a_pending_prescription(self):
        res = self._add(self.lab_test.id)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data['data']['item']['lab_test']['name'], 'Complete Blood Count')

        item = PrescriptionLabTestItem.objects.get(prescription=self.prescription)
        self.assertEqual(item.lab_test, self.lab_test)
        self.assertEqual(item.added_by, self.admin)
        # Nothing is booked by curating — the patient still books each test themselves.
        self.assertIsNone(item.booking)

    def test_the_same_lab_test_cannot_be_attached_twice(self):
        self._add(self.lab_test.id)
        res = self._add(self.lab_test.id)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already', res.data['message'].lower())
        self.assertEqual(PrescriptionLabTestItem.objects.filter(prescription=self.prescription).count(), 1)

    def test_a_second_different_lab_test_is_still_allowed(self):
        self._add(self.lab_test.id)
        res = self._add(self.other_lab_test.id)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PrescriptionLabTestItem.objects.filter(prescription=self.prescription).count(), 2)

    def test_an_inactive_lab_test_cannot_be_suggested(self):
        """A delisted test has no bookable page to send the patient to."""
        res = self._add(self.inactive_lab_test.id)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(PrescriptionLabTestItem.objects.exists())

    def test_unknown_lab_test_is_rejected(self):
        res = self._add('11111111-1111-4111-8111-111111111111')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_lab_test_id_is_required(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/admin/prescriptions/{self.prescription.id}/lab-test-items/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_curation_is_closed_once_the_prescription_leaves_pending(self):
        self.prescription.status = 'VERIFIED'
        self.prescription.save(update_fields=['status'])
        res = self._add(self.lab_test.id)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PrescriptionLabTestItem.objects.exists())

    def test_unknown_prescription_is_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/admin/prescriptions/11111111-1111-4111-8111-111111111111/lab-test-items/',
                               {'lab_test_id': str(self.lab_test.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_a_patient_cannot_curate_their_own_prescription(self):
        res = self._add(self.lab_test.id, user=self.customer)
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertFalse(PrescriptionLabTestItem.objects.exists())

    def test_curating_requires_authentication(self):
        res = self.client.post(f'/api/admin/prescriptions/{self.prescription.id}/lab-test-items/',
                               {'lab_test_id': str(self.lab_test.id)}, format='json')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    # ── remove ─────────────────────────────────────────────────────────────────
    def test_admin_can_remove_a_curated_lab_test(self):
        item_id = self._add(self.lab_test.id).data['data']['item']['id']
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/admin/prescriptions/{self.prescription.id}/lab-test-items/{item_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(PrescriptionLabTestItem.objects.exists())

    def test_removal_is_closed_once_the_prescription_leaves_pending(self):
        item_id = self._add(self.lab_test.id).data['data']['item']['id']
        self.prescription.status = 'VERIFIED'
        self.prescription.save(update_fields=['status'])
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/admin/prescriptions/{self.prescription.id}/lab-test-items/{item_id}/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(PrescriptionLabTestItem.objects.filter(id=item_id).exists())

    def test_an_item_cannot_be_deleted_through_a_different_prescription(self):
        """item_id alone must not be enough — the delete is scoped to the prescription in the URL."""
        other = Prescription.objects.create(user=self.customer, status='PENDING')
        item_id = self._add(self.lab_test.id).data['data']['item']['id']
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f'/api/admin/prescriptions/{other.id}/lab-test-items/{item_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)  # idempotent no-op, same as medicines
        self.assertTrue(PrescriptionLabTestItem.objects.filter(id=item_id).exists())

    # ── admin detail payload ───────────────────────────────────────────────────
    def test_admin_detail_returns_curated_lab_tests_alongside_medicines(self):
        self._add(self.lab_test.id)
        PrescriptionMedicineItem.objects.create(
            prescription=self.prescription, medicine=self.medicine, quantity=2, added_by=self.admin,
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/admin/prescriptions/{self.prescription.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data['data']['prescription']
        self.assertEqual(len(data['medicine_items']), 1)
        self.assertEqual(len(data['lab_test_items']), 1)
        self.assertEqual(data['lab_test_items'][0]['lab_test']['name'], 'Complete Blood Count')

    # ── verify notification ────────────────────────────────────────────────────
    def test_verifying_with_only_lab_tests_points_the_patient_at_the_review_screen(self):
        """Before this feature a lab-test-only prescription fell into the 'no items' branch and the
        patient got a bare '…has been verified.' with no link at all."""
        self._add(self.lab_test.id)
        self._verify()
        note = self._patient_notification()
        self.assertIn('1 lab test(s)', note.message)
        self.assertNotIn('medicine', note.message)
        self.assertEqual(note.link, f'/prescriptions/{self.prescription.id}/review')

    def test_verifying_with_both_names_both(self):
        self._add(self.lab_test.id)
        self._add(self.other_lab_test.id)
        PrescriptionMedicineItem.objects.create(
            prescription=self.prescription, medicine=self.medicine, quantity=1, added_by=self.admin,
        )
        self._verify()
        note = self._patient_notification()
        self.assertIn('1 medicine(s)', note.message)
        self.assertIn('2 lab test(s)', note.message)
        self.assertEqual(note.link, f'/prescriptions/{self.prescription.id}/review')

    def test_the_medicine_only_wording_is_unchanged(self):
        """Regression guard — the overwhelmingly common case must read exactly as it always did."""
        PrescriptionMedicineItem.objects.create(
            prescription=self.prescription, medicine=self.medicine, quantity=1, added_by=self.admin,
        )
        self._verify()
        note = self._patient_notification()
        self.assertEqual(
            note.message,
            'Your prescription has been verified — we found 1 medicine(s). Review and add them to your cart.',
        )

    def test_verifying_an_empty_prescription_still_has_no_review_link(self):
        self._verify()
        note = self._patient_notification()
        self.assertIsNone(note.link)

    def test_rejecting_never_counts_items(self):
        self._add(self.lab_test.id)
        self.client.force_authenticate(user=self.admin)
        self.client.put(f'/api/admin/prescriptions/{self.prescription.id}/',
                        {'status': 'REJECTED', 'rejection_reason': 'Illegible scan.'}, format='json')
        note = self._patient_notification()
        self.assertNotIn('lab test', note.message)
        self.assertIn('Illegible scan.', note.message)
        self.assertIsNone(note.link)

    # ── end to end ─────────────────────────────────────────────────────────────
    def test_a_curated_lab_test_reaches_the_patient_once_verified(self):
        """The whole point of the feature: what the admin transcribes is what the patient can book."""
        self._add(self.lab_test.id)
        self._verify()

        self.client.force_authenticate(user=self.customer)
        res = self.client.get(f'/api/prescriptions/{self.prescription.id}/lab-test-items/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = res.data['data']['lab_test_items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['lab_test']['name'], 'Complete Blood Count')
        self.assertIsNone(items[0]['booking_id'])

    def test_curated_lab_tests_stay_hidden_while_the_prescription_is_pending(self):
        self._add(self.lab_test.id)
        self.client.force_authenticate(user=self.customer)
        res = self.client.get(f'/api/prescriptions/{self.prescription.id}/lab-test-items/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_another_patient_cannot_read_the_curated_lab_tests(self):
        stranger = User.objects.create_user(
            email='stranger@example.com', full_name='Str Anger', phone='9800000403', password='pass12345',
        )
        self._add(self.lab_test.id)
        self._verify()
        self.client.force_authenticate(user=stranger)
        res = self.client.get(f'/api/prescriptions/{self.prescription.id}/lab-test-items/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
