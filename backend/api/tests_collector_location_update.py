"""Regression suite for the collector's location-update write endpoint (reported item 11).

Item 11 — "the patient can track the collector who's on the way" — was closed by adding the READ
side (the /tracking/ endpoint, covered exhaustively in tests_collector_tracking). The WRITE side —
LabCollectorLocationUpdateView, which the collector's browser PATCHes with fresh coordinates as it
moves — predates that work and stores request.user.lab_collector.lat/lng. tests_collector_tracking
sets those coordinates through the ORM, so the endpoint that actually persists them from an HTTP
request had no direct test: a broken validation branch or a missing update_fields would only ever
surface in production, where the patient's map silently stops moving.

These tests pin that endpoint: a well-formed PATCH persists both coordinates; missing or
non-numeric input is rejected; and the route is scoped to a logged-in collector (never a patient,
never anonymous). There is no pk in the URL — it always operates on the caller's own collector row,
the same shape as the delivery-rider location endpoint.

Run with `python manage.py test api.tests_collector_location_update` against a throwaway test
database. Outbound mail is mocked; nothing leaves the machine.
"""
from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, LabCollector


class CollectorLocationUpdateTests(APITestCase):
    URL = '/api/lab-collector/location/'

    def setUp(self):
        mock.patch('api.utils._send_email_async').start()
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        collector_user = User.objects.create_user(
            email='collector@example.com', full_name='Kabi Raj', phone='9800000402',
            password='pass12345', role='LAB_COLLECTOR',
        )
        # Starts with no position — a fresh collector who hasn't shared a fix yet.
        self.collector = LabCollector.objects.create(
            user=collector_user, phone='9800000402', is_verified=True,
        )
        self.patient = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000401', password='pass12345',
        )

    def _patch(self, body, as_user=None):
        if as_user is not False:
            self.client.force_authenticate(user=as_user or self.collector.user)
        return self.client.patch(self.URL, body, format='json')

    # ── the happy path ────────────────────────────────────────────────────────────
    def test_a_collector_can_push_a_fresh_position(self):
        res = self._patch({'lat': 27.6990, 'lng': 85.3120})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.collector.refresh_from_db()
        self.assertAlmostEqual(self.collector.lat, 27.6990)
        self.assertAlmostEqual(self.collector.lng, 85.3120)

    def test_a_later_push_overwrites_the_earlier_position(self):
        self._patch({'lat': 27.6990, 'lng': 85.3120})
        self._patch({'lat': 27.7100, 'lng': 85.3200})
        self.collector.refresh_from_db()
        # lat/lng is a single ever-updating current position, not a history — the newest wins.
        self.assertAlmostEqual(self.collector.lat, 27.7100)
        self.assertAlmostEqual(self.collector.lng, 85.3200)

    def test_string_coordinates_that_parse_as_numbers_are_accepted(self):
        # A browser's geolocation payload arrives JSON-encoded; a numeric string must still store.
        res = self._patch({'lat': '27.6990', 'lng': '85.3120'})
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.collector.refresh_from_db()
        self.assertAlmostEqual(self.collector.lat, 27.6990)
        self.assertAlmostEqual(self.collector.lng, 85.3120)

    # ── validation ────────────────────────────────────────────────────────────────
    def test_a_missing_coordinate_is_rejected(self):
        res = self._patch({'lat': 27.6990})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.collector.refresh_from_db()
        self.assertIsNone(self.collector.lat)
        self.assertIsNone(self.collector.lng)

    def test_a_non_numeric_coordinate_is_rejected(self):
        res = self._patch({'lat': 'here', 'lng': 'there'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.collector.refresh_from_db()
        self.assertIsNone(self.collector.lat)

    # ── the ownership boundary ──────────────────────────────────────────────────────
    def test_a_patient_cannot_post_a_collector_position(self):
        res = self._patch({'lat': 27.6990, 'lng': 85.3120}, as_user=self.patient)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_updating_a_position_requires_a_login(self):
        res = self._patch({'lat': 27.6990, 'lng': 85.3120}, as_user=False)
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
