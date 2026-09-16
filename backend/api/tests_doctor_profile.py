"""Verification suite for doctor self-service profile editing with admin approval.

Two funnels, both landing in the admin doctor-detail review queue and neither touching the live,
public Doctor row until an admin approves:
  A. Scalar profile edits (bio/qualification/experience/languages/social_links/photo) -> a single
     PENDING DoctorProfileChangeRequest, applied onto Doctor on approval.
  B. Research/credential documents -> per-row DoctorDocument (PENDING -> APPROVED/REJECTED); only
     APPROVED docs are exposed on the public profile.

Runs under `python manage.py test api.tests_doctor_profile` against a throwaway test database (never
the dev DB, never prod). Email is mocked out (see setUp) so no mail is sent; the in-app Notification
rows are still created synchronously by notify_user/_notify_admins, which is what these assert.
Uploads are routed to a temp MEDIA_ROOT (class decorator) so nothing is written to the real media
dir, and photo/PDF bytes never reach R2 in the test env (USE_R2 defaults off).
"""
import json
import shutil
import tempfile
from decimal import Decimal
from io import BytesIO
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, Doctor, DoctorProfileChangeRequest, DoctorDocument, Notification


_MEDIA_ROOT = tempfile.mkdtemp(prefix='pharmax-test-media-')


def _png_bytes():
    buf = BytesIO()
    Image.new('RGB', (2, 2), (10, 20, 30)).save(buf, format='PNG')
    return buf.getvalue()


def _png_upload(name='me.png'):
    # SimpleUploadedFile is consumed on read, so build a fresh one per request.
    return SimpleUploadedFile(name, _png_bytes(), content_type='image/png')


def _pdf_upload(name='paper.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', content_type='application/pdf')


@override_settings(MEDIA_ROOT=_MEDIA_ROOT)
class DoctorProfileSelfServiceTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        patcher = mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.doc_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000101', password='pass12345', role='DOCTOR',
        )
        self.other_user = User.objects.create_user(
            email='doc2@example.com', full_name='Bikash Thapa', phone='9800000102', password='pass12345', role='DOCTOR',
        )
        self.customer = User.objects.create_user(
            email='cust@example.com', full_name='Cust Omer', phone='9800000103', password='pass12345',
        )
        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000104', password='pass12345',
            role='ADMIN', is_super_admin=True,
        )

        # Live public values — these must never change except through an approved change request.
        self.doctor = Doctor.objects.create(
            user=self.doc_user, name='Asha Rai', specialty='Cardiology', consultation_fee=Decimal('1500'),
            qualification='MBBS', experience_years=5, languages='English', bio='Original bio',
            social_links=[{'label': 'Old', 'url': 'https://old.example.com'}], is_active=True, is_verified=True,
        )
        self.other_doctor = Doctor.objects.create(
            user=self.other_user, name='Bikash Thapa', specialty='Dermatology', consultation_fee=Decimal('1200'),
            is_active=True, is_verified=True,
        )

    # ── helpers ────────────────────────────────────────────────────────────────
    def _admin_notifs(self, notif_type):
        return Notification.objects.filter(user=self.admin, type=notif_type)

    def _doctor_notifs(self, title=None):
        qs = Notification.objects.filter(user=self.doc_user, type__startswith='DOCTOR_')
        return qs.filter(title=title) if title else qs

    def _submit_change(self, **overrides):
        self.client.force_authenticate(user=self.doc_user)
        body = {
            'bio': 'New reviewed bio',
            'qualification': 'MBBS, MD (Cardiology)',
            'experience_years': 12,
            'languages': 'English, Nepali',
            'social_links': json.dumps([
                {'label': 'Website', 'url': 'https://asha.example.com'},
                {'label': 'ResearchGate', 'url': 'https://researchgate.net/asha'},
            ]),
            'photo': _png_upload(),
        }
        body.update(overrides)
        return self.client.post('/api/doctor/profile/change-request/', body, format='multipart')

    # ── A: submit ────────────────────────────────────────────────────────────────
    def test_profile_view_starts_clean(self):
        self.client.force_authenticate(user=self.doc_user)
        res = self.client.get('/api/doctor/profile/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        data = res.data['data']
        self.assertEqual(data['doctor']['name'], 'Asha Rai')
        self.assertIsNone(data['profile_change_request'])
        self.assertEqual(data['documents'], [])

    def test_submit_creates_one_pending_without_touching_live_and_notifies_admin(self):
        res = self._submit_change()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

        reqs = DoctorProfileChangeRequest.objects.filter(doctor=self.doctor)
        self.assertEqual(reqs.count(), 1)
        req = reqs.first()
        self.assertEqual(req.status, 'PENDING')
        self.assertEqual(req.requested_bio, 'New reviewed bio')
        self.assertEqual(req.requested_experience_years, 12)
        self.assertEqual([l['label'] for l in req.requested_social_links], ['Website', 'ResearchGate'])
        self.assertTrue(req.requested_photo)  # a real ImageField file was stored

        # Live Doctor row is completely untouched until approval.
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.bio, 'Original bio')
        self.assertEqual(self.doctor.experience_years, 5)
        self.assertEqual(self.doctor.social_links, [{'label': 'Old', 'url': 'https://old.example.com'}])

        # Admin was alerted exactly once.
        self.assertEqual(self._admin_notifs('DOCTOR_PROFILE_CHANGE_REQUEST').count(), 1)

    def test_second_pending_change_is_refused(self):
        self.assertEqual(self._submit_change().status_code, status.HTTP_201_CREATED)
        res = self._submit_change()
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DoctorProfileChangeRequest.objects.filter(doctor=self.doctor).count(), 1)

    def test_social_links_and_experience_validation(self):
        self.client.force_authenticate(user=self.doc_user)
        bad_links = [
            ('bad json', 'not-json{'),
            ('not a list', json.dumps({'label': 'x', 'url': 'https://a.com'})),
            ('too many', json.dumps([{'label': f'l{i}', 'url': 'https://a.com'} for i in range(11)])),
            ('missing url', json.dumps([{'label': 'x'}])),
            ('missing label', json.dumps([{'url': 'https://a.com'}])),
            ('bad scheme', json.dumps([{'label': 'x', 'url': 'ftp://a.com'}])),
        ]
        for label, raw in bad_links:
            with self.subTest(case=label):
                res = self.client.post('/api/doctor/profile/change-request/', {'social_links': raw}, format='multipart')
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, f'{label}: {res.data}')

        for label, years in [('too high', 200), ('negative', -3), ('not a number', 'abc')]:
            with self.subTest(case=f'experience {label}'):
                res = self.client.post('/api/doctor/profile/change-request/',
                                       {'social_links': '[]', 'experience_years': years}, format='multipart')
                self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, f'{label}: {res.data}')

        # None of the rejected attempts created a row.
        self.assertEqual(DoctorProfileChangeRequest.objects.filter(doctor=self.doctor).count(), 0)

        # A well-formed empty-links submission is accepted.
        res = self.client.post('/api/doctor/profile/change-request/', {'social_links': '[]'}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)

    def test_photo_wrong_type_refused(self):
        self.client.force_authenticate(user=self.doc_user)
        res = self.client.post('/api/doctor/profile/change-request/', {
            'social_links': '[]',
            'photo': SimpleUploadedFile('evil.gif', b'GIF89a', content_type='image/gif'),
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DoctorProfileChangeRequest.objects.filter(doctor=self.doctor).count(), 0)

    # ── A: approve / reject ──────────────────────────────────────────────────────
    def test_approve_applies_to_live_row_and_shows_publicly(self):
        req = DoctorProfileChangeRequest.objects.get(id=self._submit_change().data['data']['profile_change_request']['id'])

        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/profile-change-requests/{req.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.bio, 'New reviewed bio')
        self.assertEqual(self.doctor.qualification, 'MBBS, MD (Cardiology)')
        self.assertEqual(self.doctor.experience_years, 12)
        self.assertEqual(self.doctor.languages, 'English, Nepali')
        self.assertEqual([l['label'] for l in self.doctor.social_links], ['Website', 'ResearchGate'])
        self.assertTrue(self.doctor.photo_url)  # photo_url now points at the uploaded requested_photo

        req.refresh_from_db()
        self.assertEqual(req.status, 'APPROVED')
        self.assertEqual(req.reviewed_by, self.admin)
        self.assertIsNotNone(req.reviewed_at)
        self.assertEqual(self._doctor_notifs('Profile Changes Approved').count(), 1)

        # Public detail reflects the approved values.
        self.client.force_authenticate(user=None)
        pub = self.client.get(f'/api/doctors/{self.doctor.id}/')
        self.assertEqual(pub.status_code, status.HTTP_200_OK)
        d = pub.data['data']['doctor']
        self.assertEqual(d['bio'], 'New reviewed bio')
        self.assertEqual([l['label'] for l in d['social_links']], ['Website', 'ResearchGate'])

    def test_reject_requires_note_leaves_live_untouched_and_reopens_submission(self):
        req = DoctorProfileChangeRequest.objects.get(id=self._submit_change().data['data']['profile_change_request']['id'])

        self.client.force_authenticate(user=self.admin)
        # No note -> refused.
        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/profile-change-requests/{req.id}/reject/', {})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/profile-change-requests/{req.id}/reject/',
                               {'admin_note': 'Please use a professional headshot.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        req.refresh_from_db()
        self.assertEqual(req.status, 'REJECTED')
        self.assertEqual(req.admin_note, 'Please use a professional headshot.')

        # Live values untouched by a rejection.
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.bio, 'Original bio')
        self.assertEqual(self.doctor.experience_years, 5)
        self.assertEqual(self._doctor_notifs('Profile Changes Rejected').count(), 1)

        # With no PENDING request left, the doctor can submit a fresh one.
        self.assertEqual(self._submit_change().status_code, status.HTTP_201_CREATED)

    # ── B: documents ─────────────────────────────────────────────────────────────
    def _upload_doc(self, title='Clinical Trial Results'):
        self.client.force_authenticate(user=self.doc_user)
        return self.client.post('/api/doctor/documents/', {'title': title, 'file': _pdf_upload()}, format='multipart')

    def test_document_upload_is_pending_and_hidden_until_approved(self):
        res = self._upload_doc()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        doc = DoctorDocument.objects.get(id=res.data['data']['document']['id'])
        self.assertEqual(doc.status, 'PENDING')
        self.assertTrue(doc.file)
        self.assertEqual(self._admin_notifs('DOCTOR_DOCUMENT_UPLOADED').count(), 1)

        # Not public while pending.
        self.client.force_authenticate(user=None)
        pub = self.client.get(f'/api/doctors/{self.doctor.id}/')
        self.assertEqual(pub.data['data']['doctor']['documents'], [])

        # Approve -> public, doctor notified.
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/documents/{doc.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'APPROVED')
        self.assertEqual(self._doctor_notifs('Document Approved').count(), 1)

        self.client.force_authenticate(user=None)
        pub = self.client.get(f'/api/doctors/{self.doctor.id}/')
        docs = pub.data['data']['doctor']['documents']
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]['title'], 'Clinical Trial Results')
        self.assertTrue(docs[0]['file_url'])

    def test_document_reject_requires_note_and_stays_hidden(self):
        doc = DoctorDocument.objects.get(id=self._upload_doc().data['data']['document']['id'])
        self.client.force_authenticate(user=self.admin)

        self.assertEqual(
            self.client.post(f'/api/admin/doctors/{self.doctor.id}/documents/{doc.id}/reject/', {}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/documents/{doc.id}/reject/',
                               {'admin_note': 'Unreadable scan.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'REJECTED')
        self.assertEqual(doc.admin_note, 'Unreadable scan.')

        self.client.force_authenticate(user=None)
        pub = self.client.get(f'/api/doctors/{self.doctor.id}/')
        self.assertEqual(pub.data['data']['doctor']['documents'], [])

    def test_document_bad_type_and_missing_title_refused(self):
        self.client.force_authenticate(user=self.doc_user)
        res = self.client.post('/api/doctor/documents/', {
            'title': 'Bad', 'file': SimpleUploadedFile('x.txt', b'hello', content_type='text/plain'),
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        res = self.client.post('/api/doctor/documents/', {'title': '   ', 'file': _pdf_upload()}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DoctorDocument.objects.filter(doctor=self.doctor).count(), 0)

    def test_document_delete_is_owner_scoped(self):
        doc = DoctorDocument.objects.get(id=self._upload_doc().data['data']['document']['id'])

        # A different doctor cannot delete it.
        self.client.force_authenticate(user=self.other_user)
        res = self.client.delete(f'/api/doctor/documents/{doc.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(DoctorDocument.objects.filter(id=doc.id).exists())

        # The owner can.
        self.client.force_authenticate(user=self.doc_user)
        res = self.client.delete(f'/api/doctor/documents/{doc.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(DoctorDocument.objects.filter(id=doc.id).exists())

    # ── admin embed + auth ───────────────────────────────────────────────────────
    def test_admin_detail_embeds_requests_and_documents(self):
        self._submit_change()
        self._upload_doc()
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/admin/doctors/{self.doctor.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(len(res.data['data']['profile_change_requests']), 1)
        self.assertEqual(len(res.data['data']['documents']), 1)

    def test_doctor_endpoints_reject_non_doctors(self):
        for who in (None, self.customer):
            self.client.force_authenticate(user=who)
            with self.subTest(user=getattr(who, 'email', 'anon')):
                res = self.client.get('/api/doctor/profile/')
                self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
                res = self.client.post('/api/doctor/documents/', {'title': 'x', 'file': _pdf_upload()}, format='multipart')
                self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_change_request_approve_is_permission_gated(self):
        req = DoctorProfileChangeRequest.objects.get(id=self._submit_change().data['data']['profile_change_request']['id'])
        # A plain customer must not be able to approve.
        self.client.force_authenticate(user=self.customer)
        res = self.client.post(f'/api/admin/doctors/{self.doctor.id}/profile-change-requests/{req.id}/approve/')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        req.refresh_from_db()
        self.assertEqual(req.status, 'PENDING')
