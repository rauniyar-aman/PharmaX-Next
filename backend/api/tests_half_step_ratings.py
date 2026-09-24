"""Verification suite for half-step star ratings (3.5 / 4.5 / 2.5 …).

Every rating the product collects used to be a whole integer 1–5, validated inline at six separate
endpoints with six copies of `1 <= int(rating) <= 5`. The four user-submitted columns are now
Decimal(2,1) and all six endpoints share one parser, `_parse_rating`, so there is exactly one place
where "what counts as a rating" is decided and one wording when it is refused.

What these tests pin, in order:
  1. `_parse_rating` itself — the step rule, the bounds, and the normalisation of '4.50' to 4.5.
  2. All six write endpoints accept a half step and refuse an off-step value with the shared message.
  3. The two denormalized averages (Medicine.rating, Doctor.rating) still recompute correctly now
     that they average Decimals rather than integers.
  4. DeliveryAgent's rating, which is an on-the-fly Avg() in matching.py rather than a column, still
     leaves the API as a JSON *number*. Changing the source column from integer to decimal changed
     that aggregate's output field from float to Decimal, and a Decimal that reached the renderer
     unconverted would silently become a JSON string and break the typed frontend.

Run with `python manage.py test api.tests_half_step_ratings` against a throwaway test database.
"""
import json
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.test import APITestCase

from .matching import _tracking_payload
from .models import (
    Address, Brand, Category, DeliveryAgent, Doctor, DoctorAppointment, DoctorReview,
    Medicine, Notification, Order, OrderFulfillment, Pharmacy, Review, User,
)
from .views import RATING_STEP_ERROR, _parse_rating

# Values a customer can actually produce by clicking the widget, and values nothing should accept.
GOOD_STEPS = ['0.5', '1', '1.5', '2.5', '3.5', '4.5', '5']
BAD_VALUES = [0, '0', 4.3, '2.7', 5.5, 6, -1, '-2.5', '', None, 'abc', [4], float('nan'), float('inf')]


class ParseRatingTests(APITestCase):
    """The parser in isolation — the endpoint tests below only need to prove they call it."""

    def test_accepts_every_half_step_in_range(self):
        for raw in GOOD_STEPS:
            with self.subTest(raw=raw):
                self.assertEqual(_parse_rating(raw), Decimal(raw))

    def test_accepts_the_same_value_as_str_float_int_and_decimal(self):
        # The four endpoints read from request.data, which is a parsed JSON number on some calls and
        # a multipart string on others — both have to land on the same stored value.
        for raw in ('4.5', 4.5, Decimal('4.5')):
            with self.subTest(raw=raw):
                self.assertEqual(_parse_rating(raw), Decimal('4.5'))
        self.assertEqual(_parse_rating(4), Decimal('4'))

    def test_trailing_zeros_normalise_to_one_decimal_place(self):
        # Decimal('4.50') != Decimal('4.5') as a *repr*, and the column is Decimal(2,1), so the
        # parser quantizes rather than leaving the extra place for the DB to reject.
        self.assertEqual(_parse_rating('4.50').as_tuple().exponent, -1)
        self.assertEqual(str(_parse_rating('4.50')), '4.5')
        self.assertEqual(str(_parse_rating('5.00')), '5.0')

    def test_rejects_off_step_out_of_range_and_junk(self):
        for raw in BAD_VALUES:
            with self.subTest(raw=raw):
                self.assertIsNone(_parse_rating(raw))

    def test_rejects_a_value_that_is_in_range_but_off_step(self):
        # The interesting refusal: 4.3 passes every bound check and only the modulo catches it.
        self.assertIsNone(_parse_rating('4.3'))
        self.assertIsNone(_parse_rating('4.25'))
        self.assertIsNone(_parse_rating('0.1'))


class RatingEndpointTests(APITestCase):
    def setUp(self):
        # _notify_admins fans out to email on a thread; the medicine review endpoint hits it.
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000501', password='pass12345',
        )
        self.other_customer = User.objects.create_user(
            email='other@example.com', full_name='Some One', phone='9800000502', password='pass12345',
        )
        # _notify_admins only writes rows for admins who hold the permission (or are super admins),
        # so the review-notification assertion needs a recipient to exist.
        User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000500',
            password='pass12345', role='ADMIN', is_super_admin=True,
        )

        self.medicine = Medicine.objects.create(
            name='Paracetamol 500mg', category=Category.objects.create(name='Tablets'),
            brand=Brand.objects.create(name='Acme'),
            price=Decimal('25'), original_price=Decimal('30'), stock_quantity=100,
        )

        self.doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000503',
            password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, name='Asha Rai', specialty='Cardiology',
            consultation_fee=Decimal('1500'), is_verified=True,
        )
        # A doctor review is only allowed after a COMPLETED consultation.
        DoctorAppointment.objects.create(
            user=self.customer, doctor=self.doctor, scheduled_date=date.today() - timedelta(days=2),
            time_slot='10:00 AM - 10:30 AM', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PAID', status='COMPLETED',
        )

        self.address = Address.objects.create(
            user=self.customer, label='Home', name='Cust Omer', phone='9800000501',
            address='Jhamsikhel', city='Lalitpur', province='Bagmati', district='Lalitpur',
            zip='44700', lat=27.6790, lng=85.3120,
        )
        self.order = Order.objects.create(
            user=self.customer, address=self.address, status='DELIVERED',
            total_amount=Decimal('250'), payment_status='PAID',
        )
        self.fulfillment = OrderFulfillment.objects.create(
            order=self.order, pharmacy=self._pharmacy(), delivery_agent=self._agent(), status='DELIVERED',
        )

    # ── fixtures ───────────────────────────────────────────────────────────────
    def _pharmacy(self):
        user = User.objects.create_user(
            email='pharm@example.com', full_name='Corner Pharmacy', phone='9800000504',
            password='pass12345', role='PHARMACY',
        )
        return Pharmacy.objects.create(
            user=user, name='Corner Pharmacy', license_number='DDA-5001', phone='9800000504',
            address='Pulchowk', lat=27.6780, lng=85.3170, is_verified=True,
        )

    def _agent(self):
        user = User.objects.create_user(
            email='rider@example.com', full_name='Ram Rider', phone='9800000505',
            password='pass12345', role='DELIVERY',
        )
        return DeliveryAgent.objects.create(user=user, phone='9800000505', is_verified=True)

    def _as(self, user=None):
        self.client.force_authenticate(user=user or self.customer)

    def _assert_step_refusal(self, res):
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertEqual(res.data['message'], RATING_STEP_ERROR)

    # ── 1. medicine reviews ────────────────────────────────────────────────────
    def test_medicine_review_stores_a_half_step_exactly(self):
        self._as()
        res = self.client.post(f'/api/medicines/{self.medicine.id}/reviews/',
                               {'rating': '4.5', 'comment': 'Works well.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(Review.objects.get(user=self.customer, medicine=self.medicine).rating, Decimal('4.5'))

    def test_medicine_review_is_serialized_as_a_decimal_string(self):
        # DRF coerces DecimalField to a string by default (COERCE_DECIMAL_TO_STRING is not
        # overridden in settings), which is why the TS type for these fields is `string`.
        self._as()
        res = self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '3.5'}, format='json')
        self.assertEqual(res.data['data']['review']['rating'], '3.5')

    def test_medicine_review_refuses_an_off_step_rating(self):
        self._as()
        res = self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '4.3'}, format='json')
        self._assert_step_refusal(res)
        self.assertFalse(Review.objects.exists())

    def test_medicine_review_refuses_nan_rather_than_crashing(self):
        # Regression: Decimal('NaN') survives both Decimal() and quantize() and used to raise
        # InvalidOperation on the first comparison, turning a bad request into a 500. DRF's JSON
        # parser rejects a bare NaN literal itself, but a *string* 'NaN' — which is all a form post
        # or a quoted JSON value ever is — walks straight into Decimal() and must be refused here.
        self._as()
        for raw in ('NaN', 'nan', 'Infinity', '-Infinity'):
            with self.subTest(raw=raw):
                self._assert_step_refusal(
                    self.client.post(f'/api/medicines/{self.medicine.id}/reviews/',
                                     {'rating': raw}, format='json'))
        self._assert_step_refusal(
            self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': 'NaN'}))
        self.assertFalse(Review.objects.exists())

    def test_medicine_review_update_takes_a_half_step(self):
        Review.objects.create(user=self.customer, medicine=self.medicine, rating=Decimal('5'))
        self._as()
        res = self.client.put(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '2.5'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(Review.objects.get(user=self.customer).rating, Decimal('2.5'))

    def test_medicine_review_update_refuses_zero(self):
        Review.objects.create(user=self.customer, medicine=self.medicine, rating=Decimal('5'))
        self._as()
        self._assert_step_refusal(
            self.client.put(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': 0}, format='json'))
        self.assertEqual(Review.objects.get(user=self.customer).rating, Decimal('5'))

    def test_admin_notification_writes_a_whole_rating_without_a_trailing_zero(self):
        self._as()
        self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '4'}, format='json')
        self._as(self.other_customer)
        self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '3.5'}, format='json')

        messages = ' '.join(
            Notification.objects.filter(type='NEW_REVIEW').values_list('message', flat=True))
        self.assertIn('4-star', messages)
        self.assertNotIn('4.0-star', messages)
        self.assertIn('3.5-star', messages)

    # ── 2. order rating ────────────────────────────────────────────────────────
    def test_order_rating_takes_a_half_step(self):
        self._as()
        res = self.client.put(f'/api/orders/{self.order.id}/rate/',
                              {'order_rating': '3.5', 'order_comment': 'Quick.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.order_rating, Decimal('3.5'))

    def test_order_rating_refuses_an_off_step_rating(self):
        self._as()
        self._assert_step_refusal(
            self.client.put(f'/api/orders/{self.order.id}/rate/', {'order_rating': 4.2}, format='json'))
        self.order.refresh_from_db()
        self.assertIsNone(self.order.order_rating)

    # ── 3. rider rating ────────────────────────────────────────────────────────
    def test_rider_rating_takes_a_half_step(self):
        self._as()
        res = self.client.put(f'/api/orders/fulfillments/{self.fulfillment.id}/rate-rider/',
                              {'rider_rating': '4.5'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.fulfillment.refresh_from_db()
        self.assertEqual(self.fulfillment.rider_rating, Decimal('4.5'))

    def test_rider_rating_refuses_above_five(self):
        self._as()
        self._assert_step_refusal(
            self.client.put(f'/api/orders/fulfillments/{self.fulfillment.id}/rate-rider/',
                            {'rider_rating': 6}, format='json'))
        self.fulfillment.refresh_from_db()
        self.assertIsNone(self.fulfillment.rider_rating)

    # ── 4. doctor reviews ──────────────────────────────────────────────────────
    def test_doctor_review_stores_a_half_step_exactly(self):
        self._as()
        res = self.client.post(f'/api/doctors/{self.doctor.id}/reviews/',
                               {'rating': '3.5', 'comment': 'Listened properly.'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(DoctorReview.objects.get(user=self.customer).rating, Decimal('3.5'))
        self.assertEqual(res.data['data']['review']['rating'], '3.5')

    def test_doctor_review_refuses_a_missing_rating(self):
        self._as()
        self._assert_step_refusal(
            self.client.post(f'/api/doctors/{self.doctor.id}/reviews/', {'comment': 'Good.'}, format='json'))

    def test_doctor_review_update_takes_a_half_step(self):
        DoctorReview.objects.create(user=self.customer, doctor=self.doctor, rating=Decimal('3'))
        self._as()
        res = self.client.put(f'/api/doctors/{self.doctor.id}/reviews/', {'rating': '4.5'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(DoctorReview.objects.get(user=self.customer).rating, Decimal('4.5'))

    def test_doctor_review_update_refuses_junk(self):
        DoctorReview.objects.create(user=self.customer, doctor=self.doctor, rating=Decimal('3'))
        self._as()
        self._assert_step_refusal(
            self.client.put(f'/api/doctors/{self.doctor.id}/reviews/', {'rating': 'abc'}, format='json'))
        self.assertEqual(DoctorReview.objects.get(user=self.customer).rating, Decimal('3'))

    # ── 5. denormalized averages ───────────────────────────────────────────────
    def test_medicine_average_mixes_half_and_whole_ratings(self):
        self._as()
        self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '4.5'}, format='json')
        self._as(self.other_customer)
        self.client.post(f'/api/medicines/{self.medicine.id}/reviews/', {'rating': '3'}, format='json')

        self.medicine.refresh_from_db()
        # Medicine.rating is Decimal(3,2) and always was — the average of 4.5 and 3 is 3.75 and has
        # to survive with both its decimal places, not round back to a whole star.
        self.assertEqual(self.medicine.rating, Decimal('3.75'))
        self.assertEqual(self.medicine.total_reviews, 2)

    def test_doctor_average_mixes_half_and_whole_ratings(self):
        DoctorAppointment.objects.create(
            user=self.other_customer, doctor=self.doctor, scheduled_date=date.today() - timedelta(days=1),
            time_slot='11:00 AM - 11:30 AM', fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PAID', status='COMPLETED',
        )
        self._as()
        self.client.post(f'/api/doctors/{self.doctor.id}/reviews/', {'rating': '4.5'}, format='json')
        self._as(self.other_customer)
        self.client.post(f'/api/doctors/{self.doctor.id}/reviews/', {'rating': '3.5'}, format='json')

        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.rating, Decimal('4'))
        self.assertEqual(self.doctor.total_reviews, 2)

    # ── 6. the rider average that is not a column ──────────────────────────────
    def test_delivery_agent_rating_still_leaves_the_api_as_a_json_number(self):
        """matching.py averages rider_rating on the fly into a plain dict.

        The source column is now Decimal, so that Avg() returns a Decimal where it used to return a
        float. Plain dicts skip serializer coercion, so the only thing standing between that Decimal
        and a JSON string is DRF's encoder — assert on the rendered bytes, not the dict.
        """
        agent = self.fulfillment.delivery_agent
        self.fulfillment.rider_rating = Decimal('4.5')
        self.fulfillment.save(update_fields=['rider_rating'])
        second = OrderFulfillment.objects.create(
            order=self.order, pharmacy=self.fulfillment.pharmacy, delivery_agent=agent,
            status='DELIVERED', rider_rating=Decimal('3.5'),
        )

        payload = _tracking_payload(second)
        self.assertEqual(payload['agent']['rating_count'], 2)

        rendered = json.loads(JSONRenderer().render(payload))
        self.assertEqual(rendered['agent']['rating'], 4.0)
        self.assertIsInstance(rendered['agent']['rating'], float)

    def test_delivery_agent_rating_is_null_before_anyone_rates(self):
        payload = _tracking_payload(self.fulfillment)
        self.assertIsNone(payload['agent']['rating'])
        self.assertEqual(payload['agent']['rating_count'], 0)
