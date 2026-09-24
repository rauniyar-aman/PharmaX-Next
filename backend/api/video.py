"""Video rooms for doctor consultations, and the per-participant tokens that let people in.

Consultations used to run on the public meet.jit.si. Since August 2023 that host no longer allows
anonymous room creation — the first participant has to sign in with a Google/GitHub/Facebook
account to become moderator — so our doctor and our patient both arrived and both sat on the
"waiting for a moderator" screen, and the call never started.

We run the calls on 8x8's JaaS instead, where moderator rights come from a JWT we sign with our
own key rather than from a social login. Each party gets their own short-lived token minted at
the moment they ask for the link: the doctor's says moderator, the patient's does not. Neither
has an account anywhere, and neither has to do anything but click.

Two invariants worth keeping:

* The room URL stored on the appointment is provider-shaped but token-free, so it is safe to show
  in an admin form, log, or email. The credential only ever exists in the URL handed to one
  signed-in person for a few hours.
* A link a doctor pasted in by hand (their own Zoom room, say) is never touched. Only rooms whose
  URL we minted ourselves get a token appended.
"""

import logging
import time

import jwt
from django.conf import settings

logger = logging.getLogger(__name__)

ROOM_PREFIX = 'Swasthaya-'


def _get_setting(key, default=''):
    # Local copy of the views.py accessor: importing that module here would be circular, since
    # views is what calls into this one.
    from .models import SystemSetting
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def is_configured():
    """True when we hold everything needed to sign a token: app id, key id, and private key."""
    return bool(settings.JAAS_APP_ID and settings.JAAS_API_KEY_ID and settings.JAAS_PRIVATE_KEY)


def room_base_url():
    """The `https://8x8.vc/<app-id>` prefix every room we mint hangs off.

    The first path segment is the JaaS tenant — 8x8 derives the whole XMPP endpoint set from it —
    so it is part of the room address, not decoration.
    """
    if not settings.JAAS_APP_ID:
        return ''
    return f'{settings.JAAS_BASE_URL}/{settings.JAAS_APP_ID}'


def _fallback_base_url():
    # An operator running their own Jitsi can point us at it with this setting, which predates
    # JaaS. Deliberately no default: the old hardcoded meet.jit.si fallback is what broke calls,
    # and a link that cannot work is worse than no link at all.
    return (_get_setting('jitsi_base_url', '') or '').rstrip('/')


def ensure_meeting_link(appt):
    """Give a confirmed appointment a room the instant it is confirmed, so neither party waits for
    a link to be pasted in by hand.

    Deterministic and idempotent: the room is derived from the appointment's UUID (unguessable),
    never changes across re-confirms, and is only ever written when the field is empty — a manual
    override set via DoctorAppointmentSetMeetingLinkView is always preserved.
    """
    if appt.meeting_link:
        return appt.meeting_link
    base = room_base_url() if is_configured() else _fallback_base_url()
    if not base:
        logger.warning(
            'No video provider configured (set JAAS_APP_ID/JAAS_API_KEY_ID/JAAS_PRIVATE_KEY); '
            'appointment %s has no meeting link and the doctor will have to set one by hand.',
            appt.id,
        )
        return None
    appt.meeting_link = f'{base}/{ROOM_PREFIX}{appt.id}'
    appt.save(update_fields=['meeting_link'])
    return appt.meeting_link


def is_managed_room(link):
    """Whether this link is a JaaS room we minted — i.e. one that needs a token to be joinable.

    Anything else (a doctor's own Zoom room, a self-hosted Jitsi, a Google Meet) is handed back
    to the caller untouched.
    """
    if not link or not is_configured():
        return False
    return link.startswith(f'{room_base_url()}/')


def mint_token(room, *, user_id, name, moderator, email=None, avatar=None):
    """Sign a JaaS join token for one person and one room.

    The claim shape is 8x8's: `aud`/`iss` are fixed strings, `sub` is the app id, `kid` in the
    header names which of our keys signed it. Feature flags are all off — a consultation needs a
    call, not recording or livestreaming, and leaving them off means a leaked token cannot be used
    to record a patient.
    """
    now = int(time.time())
    ttl = max(1, int(settings.JAAS_TOKEN_TTL_HOURS)) * 3600
    context_user = {
        'id': str(user_id),
        'name': name or 'Guest',
        'moderator': 'true' if moderator else 'false',
    }
    if email:
        context_user['email'] = email
    # 8x8 fetches the avatar itself, so a relative /media/ path would 404 on their side.
    if avatar and avatar.startswith('http'):
        context_user['avatar'] = avatar
    payload = {
        'aud': 'jitsi',
        'iss': 'chat',
        'sub': settings.JAAS_APP_ID,
        'room': room,
        'nbf': now - 10,  # a little slack for clock drift between us and 8x8
        'exp': now + ttl,
        'context': {
            'user': context_user,
            'features': {
                'livestreaming': 'false',
                'recording': 'false',
                'transcription': 'false',
                'outbound-call': 'false',
            },
            'room': {'regex': False},
        },
    }
    return jwt.encode(
        payload,
        settings.JAAS_PRIVATE_KEY,
        algorithm='RS256',
        headers={'kid': settings.JAAS_API_KEY_ID, 'typ': 'JWT'},
    )


def build_join_url(appt, user):
    """The URL this particular person should click to join this particular appointment.

    Returns None when there is nothing for them to join — no room yet, or they are neither the
    doctor nor the patient. An admin looking at the appointment list gets None rather than a
    working token; they have no business in the consultation.
    """
    link = appt.meeting_link
    if not link or user is None or not getattr(user, 'is_authenticated', False):
        return None
    if not is_managed_room(link):
        # A hand-set link (Zoom, Meet, a self-hosted Jitsi) carries its own access rules.
        return link

    doctor = appt.doctor
    is_doctor = bool(doctor and doctor.user_id and doctor.user_id == user.id)
    is_patient = appt.user_id == user.id
    if not (is_doctor or is_patient):
        return None

    room = link.rsplit('/', 1)[-1]
    if is_doctor:
        name, avatar = f'Dr. {doctor.name}', (doctor.photo_url or None)
    else:
        name, avatar = (user.full_name or 'Patient'), None
    try:
        token = mint_token(
            room,
            user_id=user.id,
            name=name,
            moderator=is_doctor,
            email=user.email,
            avatar=avatar,
        )
    except Exception:
        # A malformed key should cost us one join button, not the whole appointments page.
        logger.exception('Could not sign a JaaS token for appointment %s', appt.id)
        return None
    return f'{link}?jwt={token}'
