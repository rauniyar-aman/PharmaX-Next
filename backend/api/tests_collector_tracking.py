"""Verification suite for patient-side collector tracking on a lab booking.

The write side of this has always worked: the collector's browser pushes coordinates to
LabCollector.lat/lng from their Active page, and LabCollectorLocationUpdateView stores them. What
never existed was the read side — LabTestBookingSerializer returns only the collector's name and
phone, so "On the way" was a status chip and nothing else. These tests pin down the endpoint that
closes that, and in particular the one rule that isn't obvious:

LabCollector.lat/lng is a single ever-updating CURRENT position, not a per-booking snapshot. So the
coordinates must disappear the moment the collector is no longer coming to THIS patient — otherwise
someone whose sample was collected last week could keep polling and watch a collector's live
movements all day. That's the same rule matching._tracking_payload() applies to riders, and the
tests below assert it in both directions: visible while they're on the way, gone afterwards, with
name and phone (static, useful as a support reference) surviving either way.

Run with `python manage.py test api.tests_collector_tracking` against a throwaway test database.
Outbound mail is mocked at both async senders; nothing leaves the machine.
"""
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .lab_collection import collector_mark_arrived, collector_mark_en_route
from .models import (
    User, Address, LabCollector, LabTest, LabTestCategory, LabTestBooking, Notification,
)


class CollectorTrackingTests(APITestCase):
    def setUp(self):
        mock.patch('api.utils._send_email_async').start()
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.patient = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000401', password='pass12345',
        )
        self.address = Address.objects.create(
            user=self.patient, label='Home', name='Cust Omer', phone='9800000401',
            address='Jhamsikhel', city='Lalitpur', province='Bagmati', district='Lalitpur',
            zip='44700', lat=27.6790, lng=85.3120,
        )
        self.category = LabTestCategory.objects.create(name='Blood')
        self.lab_test = LabTest.objects.create(
            name='Complete Blood Count', category=self.category,
            price=Decimal('800'), original_price=Decimal('1000'),
        )
        collector_user = User.objects.create_user(
            email='collector@example.com', full_name='Kabi Raj', phone='9800000402',
            password='pass12345', role='LAB_COLLECTOR',
        )
        # ~2.2 km north of the patient's address — close enough that the ETA is a plausible
        # single-digit number, far enough that a rounding bug would show.
        self.collector = LabCollector.objects.create(
            user=collector_user, phone='9800000402', lat=27.6990, lng=85.3120, is_verified=True,
        )

    # ── helpers ────────────────────────────────────────────────────────────────
    def _booking(self, **overrides):
        kwargs = dict(
            user=self.patient, lab_test=self.lab_test, address=self.address,
            scheduled_date=date.today() + timedelta(days=1), time_slot='7:00 AM - 9:00 AM',
            total_amount=Decimal('800'), status='CONFIRMED', collector=self.collector,
        )
        kwargs.update(overrides)
        return LabTestBooking.objects.create(**kwargs)

    def _url(self, booking):
        return f'/api/lab-tests/bookings/{booking.id}/tracking/'

    def _track(self, booking, as_user=None):
        self.client.force_authenticate(user=as_user or self.patient)
        res = self.client.get(self._url(booking))
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        return res.data['data']['tracking']

    # ── the live window ────────────────────────────────────────────────────────
    def test_patient_sees_live_coordinates_while_the_collector_is_on_the_way(self):
        booking = self._booking(status='EN_ROUTE')

        tracking = self._track(booking)

        self.assertEqual(tracking['status'], 'EN_ROUTE')
        self.assertEqual(tracking['collector']['name'], 'Kabi Raj')
        self.assertEqual(tracking['collector']['phone'], '9800000402')
        self.assertAlmostEqual(tracking['collector']['lat'], 27.6990)
        self.assertAlmostEqual(tracking['collector']['lng'], 85.3120)

    def test_distance_and_eta_are_derived_from_both_ends(self):
        booking = self._booking(status='ARRIVED')

        tracking = self._track(booking)

        # 0.02° of latitude ≈ 2.2 km. Asserting the band rather than the exact float keeps this
        # from breaking on a harmless change to the haversine constant.
        self.assertGreater(tracking['distance_km'], 1.5)
        self.assertLess(tracking['distance_km'], 3.0)
        self.assertGreater(tracking['eta_minutes'], 0)

    def test_every_live_status_exposes_coordinates(self):
        for live_status in ('CONFIRMED', 'EN_ROUTE', 'ARRIVED'):
            with self.subTest(status=live_status):
                booking = self._booking(status=live_status)
                tracking = self._track(booking)
                self.assertIsNotNone(tracking['collector']['lat'], f'{live_status} should be trackable')

    # ── the window closes ──────────────────────────────────────────────────────
    def test_coordinates_disappear_once_the_sample_is_collected(self):
        """The collector has left and moved on to other patients. Their position is live, not a
        snapshot, so continuing to report it would be handing this patient a permanent tail."""
        booking = self._booking(status='SAMPLE_COLLECTED')

        tracking = self._track(booking)

        self.assertIsNone(tracking['collector']['lat'])
        self.assertIsNone(tracking['collector']['lng'])
        self.assertNotIn('distance_km', tracking)
        self.assertNotIn('eta_minutes', tracking)

    def test_name_and_phone_survive_the_window_closing(self):
        """Neither updates on its own, and the patient may still need to reach whoever took their
        sample — so these stay as a support/receipt reference when the coordinates go."""
        booking = self._booking(status='REPORT_READY')

        tracking = self._track(booking)

        self.assertEqual(tracking['collector']['name'], 'Kabi Raj')
        self.assertEqual(tracking['collector']['phone'], '9800000402')

    def test_a_cancelled_booking_stops_reporting_a_position(self):
        booking = self._booking(status='CANCELLED')

        tracking = self._track(booking)

        self.assertIsNone(tracking['collector']['lat'])

    # ── the incomplete cases ───────────────────────────────────────────────────
    def test_an_unassigned_booking_reports_no_collector(self):
        booking = self._booking(status='PENDING', collector=None)

        tracking = self._track(booking)

        self.assertIsNone(tracking['collector'])
        self.assertEqual(tracking['status'], 'PENDING')

    def test_a_collector_who_has_not_reported_a_position_yet_still_lists(self):
        """Assigned but their browser hasn't sent coordinates — the card should still show who is
        coming and how to reach them, just without a map."""
        self.collector.lat = None
        self.collector.lng = None
        self.collector.save(update_fields=['lat', 'lng'])
        booking = self._booking(status='CONFIRMED')

        tracking = self._track(booking)

        self.assertEqual(tracking['collector']['name'], 'Kabi Raj')
        self.assertIsNone(tracking['collector']['lat'])
        self.assertNotIn('distance_km', tracking)

    def test_an_address_without_a_pin_still_tracks_without_a_distance(self):
        self.address.lat = None
        self.address.lng = None
        self.address.save(update_fields=['lat', 'lng'])
        booking = self._booking(status='EN_ROUTE')

        tracking = self._track(booking)

        self.assertIsNotNone(tracking['collector']['lat'])
        self.assertNotIn('eta_minutes', tracking)

    # ── ownership ──────────────────────────────────────────────────────────────
    def test_another_patient_cannot_track_this_booking(self):
        stranger = User.objects.create_user(
            email='stranger@example.com', full_name='Nosy Parker', phone='9800000403', password='pass12345',
        )
        booking = self._booking(status='EN_ROUTE')

        self.client.force_authenticate(user=stranger)
        res = self.client.get(self._url(booking))

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_tracking_requires_a_login(self):
        booking = self._booking(status='EN_ROUTE')

        res = self.client.get(self._url(booking))

        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    # ── the notifications that lead here ───────────────────────────────────────
    def test_on_the_way_notification_links_to_the_tracking_page(self):
        """The whole point of the fix: "Collector On the Way" used to drop the patient on their
        booking list, which showed a name and nothing else."""
        booking = self._booking(status='CONFIRMED')

        ok, err = collector_mark_en_route(self.collector, booking)

        self.assertTrue(ok, err)
        notif = Notification.objects.get(user=self.patient, title='Collector On the Way')
        self.assertEqual(notif.link, f'/lab-test-bookings/{booking.id}/track')

    def test_arrived_notification_links_to_the_tracking_page(self):
        booking = self._booking(status='EN_ROUTE')

        ok, err = collector_mark_arrived(self.collector, booking)

        self.assertTrue(ok, err)
        notif = Notification.objects.get(user=self.patient, title='Collector Arrived')
        self.assertEqual(notif.link, f'/lab-test-bookings/{booking.id}/track')
