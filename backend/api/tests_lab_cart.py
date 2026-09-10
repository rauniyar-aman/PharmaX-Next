"""Verification suite for structured lab-test packages (Part A) and the multi-test cart ->
separate-bookings, one-combined-payment checkout (Part B).

Runs under `python manage.py test api.tests_lab_cart` against a throwaway test database (never the
dev DB, never prod). Email is mocked out entirely (see setUp) so no real mail is ever sent and the
notification-count assertions stay deterministic — the Notification *rows* are still created
synchronously by notify_user/notify_users_bulk, which is exactly the signal these tests check.
"""
from decimal import Decimal
from datetime import date, timedelta
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from . import utils
from .models import User, Address, LabTestCategory, LabTest, LabTestBooking, LabBookingGroup, Notification
from .views import _finalize_paid_lab_group, _cancel_unpaid_lab_group, TIME_SLOTS


def _future_date():
    return (date.today() + timedelta(days=1)).isoformat()


class LabPackageAndCartTests(APITestCase):
    def setUp(self):
        # Neutralise the email side-effect of every notification for the whole test (no threads, no
        # SMTP/Resend, no network) while leaving the in-app Notification row creation intact.
        patcher = mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.cat = LabTestCategory.objects.create(name='Blood Tests')

        self.t1 = LabTest.objects.create(name='CBC', category=self.cat, price=Decimal('500'), original_price=Decimal('600'))
        self.t2 = LabTest.objects.create(name='Lipid Profile', category=self.cat, price=Decimal('800'), original_price=Decimal('900'))
        self.t3 = LabTest.objects.create(name='Vitamin D', category=self.cat, price=Decimal('1200'), original_price=Decimal('1400'))
        self.inactive = LabTest.objects.create(name='Retired Test', category=self.cat, price=Decimal('100'), original_price=Decimal('100'), is_active=False)

        # A real structured package (created directly for the cart tests; the admin-API path is
        # exercised separately below).
        self.pkg = LabTest.objects.create(name='Full Body Checkup', category=self.cat, price=Decimal('2000'), original_price=Decimal('3000'), is_package=True)
        self.pkg.included_tests.set([self.t1, self.t2])

        self.customer = User.objects.create_user(email='cust@example.com', full_name='Cust Omer', phone='9800000001', password='pass12345')
        self.other = User.objects.create_user(email='other@example.com', full_name='Other Person', phone='9800000002', password='pass12345')
        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000003', password='pass12345',
            role='ADMIN', is_super_admin=True,
        )
        self.address = Address.objects.create(
            user=self.customer, label='Home', name='Cust Omer', phone='9800000001',
            address='Baneshwor', city='Kathmandu', province='Bagmati', zip='44600',
        )

    def _customer_notifs(self, user=None):
        return Notification.objects.filter(user=user or self.customer, type='LAB_BOOKING_UPDATE')

    def _admin_notifs(self):
        return Notification.objects.filter(user=self.admin, type='NEW_LAB_BOOKING')

    # ── Part A: structured packages ────────────────────────────────────────────

    def test_admin_create_package_with_members(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/admin/lab-tests/', {
            'name': 'Cardiac Panel', 'category_id': str(self.cat.id),
            'price': 1500, 'original_price': 2000, 'is_package': True,
            'included_test_ids': [str(self.t1.id), str(self.t2.id)],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        pkg = LabTest.objects.get(name='Cardiac Panel')
        self.assertTrue(pkg.is_package)
        self.assertEqual(set(pkg.included_tests.values_list('id', flat=True)), {self.t1.id, self.t2.id})

        # Public detail exposes the members as structured, linkable tests.
        pub = self.client.get(f'/api/lab-tests/{pkg.id}/')
        self.assertEqual(pub.status_code, status.HTTP_200_OK)
        members = pub.data['data']['labTest']['included_tests']
        self.assertEqual({m['id'] for m in members}, {str(self.t1.id), str(self.t2.id)})

    def test_included_tests_filters_self_packages_and_inactive(self):
        other_pkg = LabTest.objects.create(name='Other Pkg', category=self.cat, price=Decimal('900'), original_price=Decimal('900'), is_package=True)
        self.client.force_authenticate(user=self.admin)
        res = self.client.put(f'/api/admin/lab-tests/{self.pkg.id}/', {
            'included_test_ids': [str(self.pkg.id), str(other_pkg.id), str(self.inactive.id), str(self.t3.id)],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.pkg.refresh_from_db()
        # Self (no self-membership), a nested package, and an inactive test are all dropped — only
        # the active, non-package, non-self test survives.
        self.assertEqual(set(self.pkg.included_tests.values_list('id', flat=True)), {self.t3.id})

    def test_included_test_ids_none_leaves_members_but_empty_clears(self):
        self.client.force_authenticate(user=self.admin)
        # Omitting the field entirely (partial edit not touching membership) leaves members intact.
        res = self.client.put(f'/api/admin/lab-tests/{self.pkg.id}/', {'reporting_time': '24 hours'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.pkg.refresh_from_db()
        self.assertEqual(self.pkg.included_tests.count(), 2)
        # An explicit empty list clears them.
        res = self.client.put(f'/api/admin/lab-tests/{self.pkg.id}/', {'included_test_ids': []}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.pkg.refresh_from_db()
        self.assertEqual(self.pkg.included_tests.count(), 0)

    # ── Part B: cart COD ───────────────────────────────────────────────────────

    def test_cart_cod_creates_separate_bookings_and_single_notification_set(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/batch/', {
            'items': [str(self.t1.id), str(self.t2.id), str(self.pkg.id)],
            'address_id': str(self.address.id), 'scheduled_date': _future_date(),
            'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        group = LabBookingGroup.objects.get(id=res.data['data']['group_id'])

        bookings = list(group.bookings.all())
        self.assertEqual(len(bookings), 3)
        for b in bookings:
            self.assertEqual(b.status, 'CONFIRMED')          # COD confirms immediately
            self.assertEqual(b.payment_status, 'PENDING')    # ...but is paid at collection
            self.assertEqual(b.group_id, group.id)
            self.assertEqual(b.payment_method, 'CASH_ON_DELIVERY')
        # Each booking priced at its own test's price; the group total is their sum.
        self.assertEqual({b.lab_test_id: b.total_amount for b in bookings},
                         {self.t1.id: Decimal('500'), self.t2.id: Decimal('800'), self.pkg.id: Decimal('2000')})
        self.assertEqual(group.total_amount, Decimal('3300'))
        self.assertEqual(group.payment_status, 'PENDING')

        # A package books as ONE booking at its package price — its members are NOT expanded.
        pkg_bookings = [b for b in bookings if b.lab_test_id == self.pkg.id]
        self.assertEqual(len(pkg_bookings), 1)
        self.assertEqual(pkg_bookings[0].total_amount, Decimal('2000'))

        # total_bookings bumped once per line.
        for t, expected in [(self.t1, 1), (self.t2, 1), (self.pkg, 1)]:
            t.refresh_from_db()
            self.assertEqual(t.total_bookings, expected)

        # The crux: exactly ONE aggregated customer notification + ONE admin notification for the
        # whole cart — not 3 and not 3xadmins (which the per-booking path would have produced).
        self.assertEqual(self._customer_notifs().count(), 1)
        self.assertEqual(self._admin_notifs().count(), 1)
        self.assertEqual(self._customer_notifs().first().title, 'Lab Tests Booked')

    def test_cart_books_same_test_for_multiple_people_with_patient_fields(self):
        """#1 multi-person: the same test can appear more than once — once per person — and each
        line becomes its own booking carrying that person's inline details. A bare id (or an item
        with no patient fields) books for the account holder (all patient fields null)."""
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/batch/', {
            'items': [
                {'lab_test_id': str(self.t1.id), 'patient_name': 'Mom', 'patient_phone': '9811111111', 'patient_age': 55, 'patient_gender': 'female'},
                {'lab_test_id': str(self.t1.id), 'patient_name': 'Dad', 'patient_age': 60, 'patient_gender': 'MALE'},
                str(self.t2.id),  # bare id -> for the account holder
            ],
            'address_id': str(self.address.id), 'scheduled_date': _future_date(),
            'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        group = LabBookingGroup.objects.get(id=res.data['data']['group_id'])

        bookings = list(group.bookings.all())
        self.assertEqual(len(bookings), 3)                       # NOT deduped down to 2
        t1_bookings = {b.patient_name: b for b in bookings if b.lab_test_id == self.t1.id}
        self.assertEqual(set(t1_bookings), {'Mom', 'Dad'})       # same test, two people
        self.assertEqual(t1_bookings['Mom'].patient_gender, 'FEMALE')   # normalised to upper
        self.assertEqual(t1_bookings['Mom'].patient_age, 55)
        self.assertEqual(t1_bookings['Mom'].patient_phone, '9811111111')
        self.assertIsNone(t1_bookings['Dad'].patient_phone)      # omitted -> null

        self_booking = next(b for b in bookings if b.lab_test_id == self.t2.id)
        self.assertIsNone(self_booking.patient_name)             # bare id -> account holder

        # Total counts every line (CBC twice + Lipid once), and total_bookings bumps per line.
        self.assertEqual(group.total_amount, Decimal('500') + Decimal('500') + Decimal('800'))
        self.t1.refresh_from_db(); self.t2.refresh_from_db()
        self.assertEqual(self.t1.total_bookings, 2)
        self.assertEqual(self.t2.total_bookings, 1)
        # Still one aggregated notification set for the whole cart.
        self.assertEqual(self._customer_notifs().count(), 1)
        self.assertEqual(self._admin_notifs().count(), 1)

    def test_single_booking_for_someone_else_captures_and_returns_patient(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/', {
            'lab_test_id': str(self.t1.id), 'address_id': str(self.address.id),
            'scheduled_date': _future_date(), 'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
            'patient_name': 'Grandpa', 'patient_phone': '9822222222', 'patient_age': 80, 'patient_gender': 'male',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        data = res.data['data']['booking']
        self.assertEqual(data['patient_name'], 'Grandpa')        # round-trips through the serializer
        self.assertEqual(data['patient_gender'], 'MALE')
        self.assertEqual(data['patient_age'], 80)
        self.assertEqual(LabTestBooking.objects.get(id=data['id']).patient_phone, '9822222222')

    def test_single_booking_bad_patient_values_drop_to_null(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/', {
            'lab_test_id': str(self.t1.id), 'address_id': str(self.address.id),
            'scheduled_date': _future_date(), 'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
            'patient_name': '   ', 'patient_age': 'old', 'patient_gender': 'alien',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        booking = LabTestBooking.objects.get(id=res.data['data']['booking']['id'])
        self.assertIsNone(booking.patient_name)      # whitespace-only -> null
        self.assertIsNone(booking.patient_age)       # non-numeric -> null
        self.assertIsNone(booking.patient_gender)    # unknown choice -> null

    def test_cart_validation_and_auth(self):
        # Unauthenticated is rejected.
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/lab-tests/bookings/batch/', {'items': [str(self.t1.id)]}, format='json')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

        self.client.force_authenticate(user=self.customer)
        base = {
            'items': [str(self.t1.id)], 'address_id': str(self.address.id),
            'scheduled_date': _future_date(), 'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
        }
        cases = [
            ('empty items', {**base, 'items': []}, status.HTTP_400_BAD_REQUEST),
            ('items not a list', {**base, 'items': 'nope'}, status.HTTP_400_BAD_REQUEST),
            ('missing date', {**base, 'scheduled_date': None}, status.HTTP_400_BAD_REQUEST),
            ('bad slot', {**base, 'time_slot': 'midnight'}, status.HTTP_400_BAD_REQUEST),
            ('bad method', {**base, 'payment_method': 'BITCOIN'}, status.HTTP_400_BAD_REQUEST),
            ('bad address', {**base, 'address_id': '11111111-1111-1111-1111-111111111111'}, status.HTTP_404_NOT_FOUND),
            ('malformed id', {**base, 'items': ['not-a-uuid']}, status.HTTP_400_BAD_REQUEST),
            ('unknown test', {**base, 'items': ['22222222-2222-2222-2222-222222222222']}, status.HTTP_404_NOT_FOUND),
            ('inactive test', {**base, 'items': [str(self.inactive.id)]}, status.HTTP_404_NOT_FOUND),
        ]
        for label, body, expected in cases:
            with self.subTest(case=label):
                res = self.client.post('/api/lab-tests/bookings/batch/', body, format='json')
                self.assertEqual(res.status_code, expected, f'{label}: {res.data}')
        # None of the rejected attempts created a group or any booking.
        self.assertEqual(LabBookingGroup.objects.count(), 0)
        self.assertEqual(LabTestBooking.objects.count(), 0)

    def test_cart_online_leaves_pending_and_does_not_notify(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/batch/', {
            'items': [str(self.t1.id), str(self.t2.id)],
            'address_id': str(self.address.id), 'scheduled_date': _future_date(),
            'time_slot': TIME_SLOTS[0], 'payment_method': 'ESEWA',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        group = LabBookingGroup.objects.get(id=res.data['data']['group_id'])
        self.assertEqual(group.payment_status, 'PENDING')
        for b in group.bookings.all():
            self.assertEqual(b.status, 'PENDING')            # not confirmed until payment verifies
            self.assertEqual(b.payment_status, 'PENDING')
        # No premature notifications on the online path.
        self.assertEqual(self._customer_notifs().count(), 0)
        self.assertEqual(self._admin_notifs().count(), 0)

    # ── Part B: group payment finalize / cancel ────────────────────────────────

    def _make_esewa_group(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/batch/', {
            'items': [str(self.t1.id), str(self.t2.id)],
            'address_id': str(self.address.id), 'scheduled_date': _future_date(),
            'time_slot': TIME_SLOTS[0], 'payment_method': 'ESEWA',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return LabBookingGroup.objects.get(id=res.data['data']['group_id'])

    def test_finalize_paid_lab_group_confirms_and_is_idempotent(self):
        group = self._make_esewa_group()
        _finalize_paid_lab_group(group)
        group.refresh_from_db()
        self.assertEqual(group.payment_status, 'PAID')
        for b in group.bookings.all():
            self.assertEqual(b.status, 'CONFIRMED')
            self.assertEqual(b.payment_status, 'PAID')
        self.assertEqual(self._customer_notifs().count(), 1)
        self.assertEqual(self._admin_notifs().count(), 1)

        # Calling again (e.g. a duplicate gateway callback) must not double-confirm or double-notify.
        _finalize_paid_lab_group(group)
        self.assertEqual(self._customer_notifs().count(), 1)
        self.assertEqual(self._admin_notifs().count(), 1)

    def test_cancel_unpaid_lab_group_respects_progressed_bookings(self):
        group = self._make_esewa_group()
        bookings = list(group.bookings.all())
        # Simulate one child having already been paid+confirmed (guard must protect it).
        bookings[0].status = 'CONFIRMED'
        bookings[0].payment_status = 'PAID'
        bookings[0].save(update_fields=['status', 'payment_status'])

        _cancel_unpaid_lab_group(group)

        bookings[0].refresh_from_db()
        bookings[1].refresh_from_db()
        self.assertEqual(bookings[0].status, 'CONFIRMED')    # untouched
        self.assertEqual(bookings[1].status, 'CANCELLED')    # the still-pending one is cancelled
        # No confirmation notifications from a cancellation.
        self.assertEqual(self._customer_notifs().count(), 0)
        self.assertEqual(self._admin_notifs().count(), 0)

    # ── Part B: eSewa group initiate (pure signing, no network) ────────────────

    def test_esewa_group_initiate_signs_group_total(self):
        group = self._make_esewa_group()
        res = self.client.post('/api/payment/esewa/initiate-lab-group/', {'group_id': str(group.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        params = res.data['data']['params']
        self.assertTrue(res.data['data']['formUrl'])
        self.assertTrue(params['transaction_uuid'].startswith(f'{group.id}-'))
        self.assertEqual(params['total_amount'], str(group.total_amount))
        group.refresh_from_db()
        self.assertEqual(group.esewa_transaction_uuid, params['transaction_uuid'])

        # Once paid, initiate is refused.
        group.payment_status = 'PAID'
        group.save(update_fields=['payment_status'])
        res = self.client.post('/api/payment/esewa/initiate-lab-group/', {'group_id': str(group.id)}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Part B: group detail (owner-scoped) ────────────────────────────────────

    def test_group_detail_is_owner_scoped(self):
        group = self._make_esewa_group()
        self.client.force_authenticate(user=self.customer)
        res = self.client.get(f'/api/lab-tests/bookings/groups/{group.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data['data']['group']
        self.assertEqual(len(data['bookings']), 2)
        self.assertEqual(data['total_amount'], str(group.total_amount))

        # A different customer cannot read someone else's group.
        self.client.force_authenticate(user=self.other)
        res = self.client.get(f'/api/lab-tests/bookings/groups/{group.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # ── Regression: single-test flow is untouched ──────────────────────────────

    def test_single_test_booking_has_no_group_and_notifies_per_booking(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.post('/api/lab-tests/bookings/', {
            'lab_test_id': str(self.t1.id), 'address_id': str(self.address.id),
            'scheduled_date': _future_date(), 'time_slot': TIME_SLOTS[0], 'payment_method': 'CASH_ON_DELIVERY',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        booking = LabTestBooking.objects.get(id=res.data['data']['booking']['id'])
        self.assertIsNone(booking.group_id)                  # single-test bookings never join a group
        self.assertEqual(booking.status, 'CONFIRMED')
        # The per-booking (notify=True) path still fires its own single customer + admin notification.
        self.assertEqual(self._customer_notifs().count(), 1)
        self.assertEqual(self._admin_notifs().count(), 1)
        self.assertEqual(self._customer_notifs().first().title, 'Lab Test Booking Confirmed')
