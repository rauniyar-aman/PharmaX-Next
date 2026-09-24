"""Verification suite for the video-consultation fix.

The reported failure: a doctor and a patient both joined a confirmed consultation and both sat on
a "waiting for a moderator" screen — the call never started. Root cause was the provider, not our
code: `_ensure_meeting_link` minted rooms on the public meet.jit.si, which since August 2023 will
not let an anonymous participant create a room or take moderator, and neither of our two parties
has an account there.

Calls now run on 8x8 JaaS, where moderator comes from a JWT we sign ourselves. These tests pin the
three things that make that work and the two that keep it safe:

  * the doctor's token says moderator and the patient's does not — that is the whole bug;
  * the token is signed with our key, names our app, and is scoped to that one room;
  * the room address stored on the appointment stays token-free, so it is safe in an admin form;
  * nobody but those two people gets a working link — an admin reading the list gets none;
  * a link a doctor pasted in by hand is never rewritten.

A throwaway RSA keypair is generated per run, so the suite signs and verifies for real rather than
trusting a mocked signature. Run with `python manage.py test api.tests_video_consult`.
"""
from datetime import date, timedelta
from decimal import Decimal
from importlib import import_module
from unittest import mock

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from . import video
from .models import Doctor, DoctorAppointment, SystemSetting, User

APP_ID = 'vpaas-magic-cookie-1fc542a3e4414a44b2611668195e2bfe'
KEY_ID = f'{APP_ID}/4f4910'


def _keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


PRIVATE_PEM, PUBLIC_PEM = _keypair()

jaas_configured = override_settings(
    JAAS_BASE_URL='https://8x8.vc',
    JAAS_APP_ID=APP_ID,
    JAAS_API_KEY_ID=KEY_ID,
    JAAS_PRIVATE_KEY=PRIVATE_PEM,
    JAAS_TOKEN_TTL_HOURS=4,
)


class VideoConsultBase(APITestCase):
    def setUp(self):
        mock.patch('api.utils._send_email_async').start()
        mock.patch('api.utils._send_notification_email_async', lambda *a, **k: None).start()
        self.addCleanup(mock.patch.stopall)

        self.admin = User.objects.create_user(
            email='admin@example.com', full_name='Super Admin', phone='9800000301',
            password='pass12345', role='ADMIN', is_super_admin=True,
        )
        self.customer = User.objects.create_user(
            email='patient@example.com', full_name='Cust Omer', phone='9800000302', password='pass12345',
        )
        self.doctor_user = User.objects.create_user(
            email='doc@example.com', full_name='Asha Rai', phone='9800000303',
            password='pass12345', role='DOCTOR',
        )
        self.doctor = Doctor.objects.create(
            user=self.doctor_user, name='Asha Rai', specialty='Cardiology',
            consultation_fee=Decimal('1500'), is_verified=True,
        )
        self.appt = DoctorAppointment.objects.create(
            user=self.customer, doctor=self.doctor,
            scheduled_date=date.today() + timedelta(days=3),
            time_slot='10:00 AM - 10:30 AM',
            fee_amount=Decimal('1500'), fee_charged=Decimal('1500'),
            payment_status='PAID', status='CONFIRMED',
        )

    def decode(self, join_url):
        """Verify a join URL's token against the public half of the test keypair."""
        self.assertIn('?jwt=', join_url)
        room_url, token = join_url.split('?jwt=', 1)
        claims = jwt.decode(token, PUBLIC_PEM, algorithms=['RS256'], audience='jitsi')
        return room_url, token, claims


@jaas_configured
class MeetingRoomTests(VideoConsultBase):
    def test_room_is_minted_under_the_jaas_tenant(self):
        # The app id is the first path segment because 8x8 derives the whole XMPP endpoint set
        # from it — a room without it resolves to no tenant at all.
        self.appt.meeting_link = ''
        link = video.ensure_meeting_link(self.appt)
        self.assertEqual(link, f'https://8x8.vc/{APP_ID}/Swasthaya-{self.appt.id}')
        self.appt.refresh_from_db()
        self.assertEqual(self.appt.meeting_link, link)

    def test_room_is_stable_and_never_overwrites_a_manual_link(self):
        self.appt.meeting_link = 'https://zoom.us/j/9876543210'
        self.appt.save(update_fields=['meeting_link'])
        self.assertEqual(video.ensure_meeting_link(self.appt), 'https://zoom.us/j/9876543210')

        self.appt.meeting_link = ''
        first = video.ensure_meeting_link(self.appt)
        self.assertEqual(video.ensure_meeting_link(self.appt), first)

    def test_stored_room_never_carries_a_token(self):
        # The stored value is shown in the admin form and can be logged; the credential belongs
        # only on the URL handed to one signed-in person.
        self.appt.meeting_link = ''
        link = video.ensure_meeting_link(self.appt)
        self.assertNotIn('jwt', link)


class UnconfiguredProviderTests(VideoConsultBase):
    @override_settings(JAAS_APP_ID='', JAAS_API_KEY_ID='', JAAS_PRIVATE_KEY='')
    def test_no_link_is_invented_when_no_provider_is_configured(self):
        # The old code fell back to a hardcoded meet.jit.si, which is exactly the dead link that
        # produced the bug. A missing link is recoverable (the doctor sets one); a link that
        # cannot work is not.
        self.appt.meeting_link = ''
        self.assertIsNone(video.ensure_meeting_link(self.appt))
        self.appt.refresh_from_db()
        self.assertFalse(self.appt.meeting_link)

    @override_settings(JAAS_APP_ID='', JAAS_API_KEY_ID='', JAAS_PRIVATE_KEY='')
    def test_self_hosted_jitsi_setting_is_still_honoured(self):
        SystemSetting.objects.create(key='jitsi_base_url', value='https://meet.example.org')
        self.appt.meeting_link = ''
        self.assertEqual(
            video.ensure_meeting_link(self.appt),
            f'https://meet.example.org/Swasthaya-{self.appt.id}',
        )


@jaas_configured
class TokenTests(VideoConsultBase):
    def test_doctor_is_moderator(self):
        video.ensure_meeting_link(self.appt)
        _room, _token, claims = self.decode(video.build_join_url(self.appt, self.doctor_user))
        self.assertEqual(claims['context']['user']['moderator'], 'true')
        self.assertEqual(claims['context']['user']['name'], 'Dr. Asha Rai')

    def test_patient_is_not_moderator(self):
        video.ensure_meeting_link(self.appt)
        _room, _token, claims = self.decode(video.build_join_url(self.appt, self.customer))
        self.assertEqual(claims['context']['user']['moderator'], 'false')
        self.assertEqual(claims['context']['user']['name'], 'Cust Omer')

    def test_token_names_our_app_and_only_this_room(self):
        video.ensure_meeting_link(self.appt)
        join = video.build_join_url(self.appt, self.doctor_user)
        room_url, token, claims = self.decode(join)
        self.assertEqual(room_url, self.appt.meeting_link)
        self.assertEqual(claims['aud'], 'jitsi')
        self.assertEqual(claims['iss'], 'chat')
        self.assertEqual(claims['sub'], APP_ID)
        # Scoped to the one room, not '*' — a leaked token opens one consultation, not the tenant.
        self.assertEqual(claims['room'], f'Swasthaya-{self.appt.id}')
        self.assertIs(claims['context']['room']['regex'], False)
        self.assertEqual(jwt.get_unverified_header(token)['kid'], KEY_ID)
        self.assertEqual(jwt.get_unverified_header(token)['alg'], 'RS256')

    def test_token_expires(self):
        video.ensure_meeting_link(self.appt)
        _room, _token, claims = self.decode(video.build_join_url(self.appt, self.doctor_user))
        self.assertLess(claims['exp'] - claims['nbf'], 5 * 3600)
        self.assertGreater(claims['exp'] - claims['nbf'], 3 * 3600)

    def test_recording_and_livestreaming_stay_off(self):
        # A consultation needs a call. Leaving these off means a leaked token cannot be used to
        # record a patient.
        video.ensure_meeting_link(self.appt)
        _room, _token, claims = self.decode(video.build_join_url(self.appt, self.doctor_user))
        features = claims['context']['features']
        self.assertEqual(features['recording'], 'false')
        self.assertEqual(features['livestreaming'], 'false')
        self.assertEqual(features['transcription'], 'false')

    def test_nobody_else_gets_a_way_in(self):
        video.ensure_meeting_link(self.appt)
        self.assertIsNone(video.build_join_url(self.appt, self.admin))

    def test_a_hand_set_link_is_handed_back_untouched(self):
        self.appt.meeting_link = 'https://zoom.us/j/9876543210'
        self.appt.save(update_fields=['meeting_link'])
        for user in (self.doctor_user, self.customer):
            self.assertEqual(video.build_join_url(self.appt, user), 'https://zoom.us/j/9876543210')

    def test_no_room_means_no_join_url(self):
        self.appt.meeting_link = ''
        self.appt.save(update_fields=['meeting_link'])
        self.assertIsNone(video.build_join_url(self.appt, self.doctor_user))

    def test_a_broken_signing_key_costs_one_button_not_the_page(self):
        video.ensure_meeting_link(self.appt)
        with override_settings(JAAS_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\nnonsense\n'):
            self.assertIsNone(video.build_join_url(self.appt, self.doctor_user))


@jaas_configured
class AppointmentApiTests(VideoConsultBase):
    def test_patient_appointment_list_carries_a_guest_join_url(self):
        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/doctors/appointments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        appt = res.data['data']['appointments'][0]
        _room, _token, claims = self.decode(appt['join_url'])
        self.assertEqual(claims['context']['user']['moderator'], 'false')

    def test_doctor_appointment_list_carries_a_moderator_join_url(self):
        self.client.force_authenticate(user=self.doctor_user)
        res = self.client.get('/api/doctor/appointments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        appt = res.data['data']['appointments'][0]
        _room, _token, claims = self.decode(appt['join_url'])
        self.assertEqual(claims['context']['user']['moderator'], 'true')

    def test_a_confirmed_appointment_with_no_room_gets_one_on_read(self):
        # This is what carries migration 0067's cleared meet.jit.si links over to the new
        # provider: nobody has to re-confirm anything, the room appears when it is next needed.
        self.appt.meeting_link = None
        self.appt.save(update_fields=['meeting_link'])

        self.client.force_authenticate(user=self.customer)
        res = self.client.get('/api/doctors/appointments/')
        appt = res.data['data']['appointments'][0]
        self.assertTrue(appt['meeting_link'].startswith(f'https://8x8.vc/{APP_ID}/'))
        self.assertIsNotNone(appt['join_url'])

    def test_admin_sees_the_room_but_gets_no_way_into_it(self):
        video.ensure_meeting_link(self.appt)
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/admin/appointments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        appt = next(a for a in res.data['data']['appointments'] if a['id'] == str(self.appt.id))
        # The admin needs the room address to read and edit; they have no business in the call.
        self.assertEqual(appt['meeting_link'], self.appt.meeting_link)
        self.assertIsNone(appt['join_url'])

    def test_doctors_manual_override_survives_and_is_served_as_is(self):
        self.client.force_authenticate(user=self.doctor_user)
        res = self.client.post(
            f'/api/doctor/appointments/{self.appt.id}/set-meeting-link/',
            {'meeting_link': 'https://zoom.us/j/9876543210'}, format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['data']['appointment']['join_url'], 'https://zoom.us/j/9876543210')


@jaas_configured
class DeadLinkCleanupTests(VideoConsultBase):
    """Migration 0067 — retire the meet.jit.si rooms without touching anything else."""

    def _run(self):
        from django.apps import apps as global_apps
        # The module name starts with a digit, so it cannot be imported with `from ... import`.
        migration = import_module('api.migrations.0067_clear_dead_meeting_links')
        migration.clear_dead_meeting_links(global_apps, None)

    def _appt(self, link, **overrides):
        kwargs = dict(
            user=self.customer, doctor=self.doctor,
            scheduled_date=date.today() + timedelta(days=3),
            time_slot='11:00 AM - 11:30 AM', fee_amount=Decimal('1500'),
            fee_charged=Decimal('1500'), payment_status='PAID', status='CONFIRMED',
            meeting_link=link,
        )
        kwargs.update(overrides)
        return DoctorAppointment.objects.create(**kwargs)

    def test_dead_jitsi_rooms_on_upcoming_appointments_are_cleared(self):
        appt = self._appt(f'https://meet.jit.si/Swasthaya-{self.appt.id}')
        self._run()
        appt.refresh_from_db()
        self.assertIsNone(appt.meeting_link)

    def test_hand_set_links_are_left_alone(self):
        zoom = self._appt('https://zoom.us/j/9876543210')
        self_hosted = self._appt('https://meet.example.org/Swasthaya-abc')
        self._run()
        zoom.refresh_from_db()
        self_hosted.refresh_from_db()
        self.assertEqual(zoom.meeting_link, 'https://zoom.us/j/9876543210')
        self.assertEqual(self_hosted.meeting_link, 'https://meet.example.org/Swasthaya-abc')

    def test_past_and_unconfirmed_appointments_are_left_alone(self):
        past = self._appt('https://meet.jit.si/Swasthaya-past',
                          scheduled_date=date.today() - timedelta(days=2))
        pending = self._appt('https://meet.jit.si/Swasthaya-pending', status='PENDING')
        self._run()
        past.refresh_from_db()
        pending.refresh_from_db()
        self.assertEqual(past.meeting_link, 'https://meet.jit.si/Swasthaya-past')
        self.assertEqual(pending.meeting_link, 'https://meet.jit.si/Swasthaya-pending')
