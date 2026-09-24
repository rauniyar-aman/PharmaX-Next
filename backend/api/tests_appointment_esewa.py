"""eSewa as a second payment option for doctor consultations.

Until now a consultation could only be paid for with Khalti, while orders and lab tests had both
gateways. This suite pins the new eSewa path end to end: the signed form payload we hand the
browser, the success callback that settles the money, and the failure callback that releases the
slot. `_confirm_appointment()` itself is already covered by `tests_doctor_notifications`; what is
tested here is that the eSewa path reaches it exactly once and on the same terms as Khalti.

The gateway is never contacted — `requests.get` is mocked at the views module. Run with
`python manage.py test api.tests_appointment_esewa`.
"""
import base64
import hashlib
import hmac
import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, Doctor, DoctorAppointment, Notification
from .views import ESEWA_PRODUCT_CODE, ESEWA_SECRET_KEY


def _esewa_callback_data(transaction_uuid, total_amount, gateway_status='COMPLETE'):
    """The base64 JSON blob eSewa appends to its redirect as `?data=`."""
    payload = {
        'transaction_uuid': transaction_uuid,
        'total_amount': total_amount,
        'status': gateway_status,
        'product_code': ESEWA_PRODUCT_CODE,
    }
    return base64.b64encode(json.dumps(payload).encode()).decode()


class AppointmentEsewaTests(APITestCase):
    def setUp(self):
        # notify_user/_notify_admins fan out to email on a thread; keep the suite offline.
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000301',
            password='pass12345', role='ADMIN', is_super_admin=True,
        )
        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000302', password='pass12345',
        )
        self.other_customer = User.objects.create_user(
            email='someone@example.com', full_name='Some One', phone='9800000303', password='pass12345',
        )
        self.doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000304',
            password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, name='Asha Rai', specialty='Cardiology',
            consultation_fee=Decimal('1500'), is_verified=True,
        )

    # ── helpers ────────────────────────────────────────────────────────────────
    def _appointment(self, **overrides):
        kwargs = dict(
            user=self.customer, doctor=self.doctor, scheduled_date=date.today() + timedelta(days=3),
            time_slot='10:00 AM - 10:30 AM', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PENDING', status='PENDING',
        )
        kwargs.update(overrides)
        return DoctorAppointment.objects.create(**kwargs)

    def _initiate(self, appt, user=None):
        self.client.force_authenticate(user=user or self.customer)
        return self.client.post('/api/payment/esewa/initiate-appointment/',
                                {'appointment_id': str(appt.id)}, format='json')

    def _verified_gateway(self, gateway_status='COMPLETE'):
        """Patch the server-to-server status lookup eSewa's success redirect triggers."""
        resp = mock.Mock()
        resp.json.return_value = {'status': gateway_status}
        return mock.patch('api.views.requests.get', return_value=resp)

    # ── initiate ───────────────────────────────────────────────────────────────
    def test_initiate_returns_a_correctly_signed_form_payload(self):
        appt = self._appointment()
        res = self._initiate(appt)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        params = res.data['data']['params']
        self.assertEqual(params['total_amount'], '1500.00')
        self.assertEqual(params['amount'], '1500.00')
        self.assertEqual(params['product_code'], ESEWA_PRODUCT_CODE)
        self.assertEqual(params['signed_field_names'], 'total_amount,transaction_uuid,product_code')
        self.assertTrue(params['success_url'].endswith('/api/payment/esewa/success-appointment/'))
        self.assertTrue(params['failure_url'].endswith('/api/payment/esewa/failure-appointment/'))

        # eSewa rejects the form outright if the HMAC doesn't match, so recompute it here rather
        # than trusting that _esewa_signature was called with the right message.
        msg = (f"total_amount={params['total_amount']},transaction_uuid={params['transaction_uuid']},"
               f'product_code={ESEWA_PRODUCT_CODE}')
        expected = base64.b64encode(
            hmac.new(ESEWA_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).digest()
        ).decode()
        self.assertEqual(params['signature'], expected)

    def test_initiate_stamps_the_appointment_so_the_callback_can_find_it(self):
        appt = self._appointment()
        res = self._initiate(appt)
        appt.refresh_from_db()
        self.assertEqual(appt.payment_method, 'ESEWA')
        self.assertEqual(appt.esewa_transaction_uuid, res.data['data']['params']['transaction_uuid'])
        self.assertTrue(appt.esewa_transaction_uuid.startswith(str(appt.id)))
        # Money must not move on initiate — only the success callback settles it.
        self.assertEqual(appt.payment_status, 'PENDING')
        self.assertEqual(appt.status, 'PENDING')

    def test_initiate_refuses_a_plus_free_consultation(self):
        appt = self._appointment(payment_status='NOT_REQUIRED', fee_charged=Decimal('0'), is_plus_free=True)
        res = self._initiate(appt)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('NOT_REQUIRED', res.data['message'])

    def test_initiate_refuses_an_already_paid_appointment(self):
        appt = self._appointment(payment_status='PAID')
        res = self._initiate(appt)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_initiate_cannot_reach_someone_elses_appointment(self):
        appt = self._appointment()
        res = self._initiate(appt, user=self.other_customer)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        appt.refresh_from_db()
        self.assertIsNone(appt.esewa_transaction_uuid)

    def test_initiate_requires_authentication(self):
        appt = self._appointment()
        res = self.client.post('/api/payment/esewa/initiate-appointment/',
                               {'appointment_id': str(appt.id)}, format='json')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_initiate_requires_an_appointment_id(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/payment/esewa/initiate-appointment/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ── success callback ───────────────────────────────────────────────────────
    def test_verified_payment_confirms_the_appointment_and_notifies_all_three_parties(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'])

        self.client.force_authenticate(user=None)
        with self._verified_gateway():
            res = self.client.get('/api/payment/esewa/success-appointment/', {'data': data})

        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertIn(f'appointmentId={appt.id}', res['Location'])
        appt.refresh_from_db()
        self.assertEqual(appt.payment_status, 'PAID')
        self.assertEqual(appt.status, 'CONFIRMED')
        self.assertEqual(Notification.objects.filter(user=self.customer, title='Appointment Confirmed').count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.doctor_user, title='New Appointment Booked').count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.admin, title='New Doctor Appointment').count(), 1)

    def test_a_replayed_success_callback_does_not_double_notify(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'])

        self.client.force_authenticate(user=None)
        with self._verified_gateway():
            self.client.get('/api/payment/esewa/success-appointment/', {'data': data})
            self.client.get('/api/payment/esewa/success-appointment/', {'data': data})

        self.assertEqual(Notification.objects.filter(user=self.customer, title='Appointment Confirmed').count(), 1)
        self.assertEqual(Notification.objects.filter(user=self.doctor_user, title='New Appointment Booked').count(), 1)

    def test_a_gateway_that_does_not_confirm_leaves_the_appointment_unpaid(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'])

        self.client.force_authenticate(user=None)
        with self._verified_gateway(gateway_status='PENDING'):
            res = self.client.get('/api/payment/esewa/success-appointment/', {'data': data})

        self.assertIn('reason=not_verified', res['Location'])
        appt.refresh_from_db()
        self.assertEqual(appt.payment_status, 'PENDING')
        self.assertEqual(appt.status, 'PENDING')

    def test_a_forged_success_redirect_is_rejected_by_the_server_side_lookup(self):
        """The `data` blob is attacker-controllable — saying COMPLETE in it must not be enough."""
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'])

        self.client.force_authenticate(user=None)
        with self._verified_gateway(gateway_status='NOT_FOUND'):
            self.client.get('/api/payment/esewa/success-appointment/', {'data': data})

        appt.refresh_from_db()
        self.assertEqual(appt.payment_status, 'PENDING')
        self.assertEqual(Notification.objects.filter(user=self.customer, title='Appointment Confirmed').count(), 0)

    def test_callback_blob_saying_the_payment_is_incomplete_never_reaches_the_gateway(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'], gateway_status='CANCELED')

        self.client.force_authenticate(user=None)
        with self._verified_gateway() as get:
            res = self.client.get('/api/payment/esewa/success-appointment/', {'data': data})
        get.assert_not_called()
        self.assertIn('reason=incomplete', res['Location'])

    def test_missing_and_unreadable_callback_data_land_on_payment_failed(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/payment/esewa/success-appointment/')
        self.assertIn('reason=missing_data', res['Location'])
        res = self.client.get('/api/payment/esewa/success-appointment/', {'data': 'not-base64-json'})
        self.assertIn('reason=bad_data', res['Location'])

    def test_unknown_transaction_uuid_lands_on_payment_failed(self):
        self.client.force_authenticate(user=None)
        data = _esewa_callback_data('no-such-uuid', '1500.00')
        with self._verified_gateway():
            res = self.client.get('/api/payment/esewa/success-appointment/', {'data': data})
        self.assertIn('reason=appointment_not_found', res['Location'])

    # ── failure callback ───────────────────────────────────────────────────────
    def test_cancelling_at_the_gateway_releases_the_slot(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'], gateway_status='CANCELED')

        self.client.force_authenticate(user=None)
        res = self.client.get('/api/payment/esewa/failure-appointment/', {'data': data})

        self.assertIn('reason=esewa_cancelled', res['Location'])
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'CANCELLED')
        # payment_status has no FAILED state — a payment simply never happened.
        self.assertEqual(appt.payment_status, 'PENDING')

    def test_a_late_failure_callback_cannot_cancel_an_appointment_that_already_paid(self):
        appt = self._appointment()
        params = self._initiate(appt).data['data']['params']
        data = _esewa_callback_data(params['transaction_uuid'], params['total_amount'])

        self.client.force_authenticate(user=None)
        with self._verified_gateway():
            self.client.get('/api/payment/esewa/success-appointment/', {'data': data})
        self.client.get('/api/payment/esewa/failure-appointment/', {'data': data})

        appt.refresh_from_db()
        self.assertEqual(appt.status, 'CONFIRMED')
        self.assertEqual(appt.payment_status, 'PAID')

    def test_failure_callback_without_data_still_redirects(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/payment/esewa/failure-appointment/')
        self.assertIn('reason=esewa_cancelled', res['Location'])
