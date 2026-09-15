import os
import mimetypes
import random
import string
import time
import logging
import threading
from django.core.mail import EmailMultiAlternatives
from django.conf import settings

logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
BRAND_COLOR = '#006B2C'


def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))


def get_store_name():
    from .models import SystemSetting
    try:
        return SystemSetting.objects.get(key='store_name').value or 'Swasthaya'
    except SystemSetting.DoesNotExist:
        return 'Swasthaya'


def _render_email_html(store_name, heading, body_html, cta_text=None, cta_url=None):
    """Shared decorative shell for every outbound email — inline styles only, since email clients
    strip <style> blocks. Kept to a single centered card so it renders consistently whether it's
    an OTP code or an order/prescription update."""
    cta_html = ''
    if cta_text and cta_url:
        cta_html = f'''
        <tr>
          <td align="center" style="padding: 8px 0 4px;">
            <a href="{cta_url}" style="display:inline-block; background:{BRAND_COLOR}; color:#ffffff; text-decoration:none;
              font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; padding:12px 28px; border-radius:10px;">
              {cta_text}
            </a>
          </td>
        </tr>'''

    return f'''<!DOCTYPE html>
<html>
<body style="margin:0; padding:24px 12px; background:#f2f4f3; font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; margin:0 auto;">
    <tr>
      <td style="background:{BRAND_COLOR}; border-radius:16px 16px 0 0; padding:22px 28px;">
        <span style="color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:0.3px;">{store_name}</span>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff; border-radius:0 0 16px 16px; padding:32px 28px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:19px; font-weight:bold; color:#1a1c1a; padding-bottom:12px;">
              {heading}
            </td>
          </tr>
          <tr>
            <td style="font-size:14px; line-height:1.6; color:#43483f;">
              {body_html}
            </td>
          </tr>
          {cta_html}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 8px 0; text-align:center;">
        <span style="font-size:11px; color:#8a8f86;">
          This is an automated message from {store_name}. If you didn't expect this email, you can safely ignore it.
        </span>
      </td>
    </tr>
  </table>
</body>
</html>'''


def _use_resend_http():
    """Render's free tier blocks outbound SMTP ports (25/465/587), so SMTP sends to
    smtp.resend.com silently time out in prod. When the backend is configured for Resend,
    send over Resend's HTTP API (port 443, never blocked) instead. Local dev on Gmail SMTP
    is unaffected and keeps using Django's SMTP backend below."""
    return settings.EMAIL_HOST == 'smtp.resend.com' and bool(settings.EMAIL_HOST_PASSWORD)


def _send_via_resend_http(to_email, subject, html_body, text_body, attachments=None):
    import requests
    import base64
    payload = {
        'from': settings.EMAIL_FROM,
        'to': [to_email],
        'subject': subject,
        'html': html_body,
        'text': text_body,
    }
    if attachments:
        payload['attachments'] = [
            {'filename': fn, 'content': base64.b64encode(content).decode()}
            for fn, content, _mime in attachments
        ]
    resp = requests.post(
        'https://api.resend.com/emails',
        headers={
            'Authorization': f'Bearer {settings.EMAIL_HOST_PASSWORD}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=15,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f'Resend API {resp.status_code}: {resp.text}')


def _send_via_smtp(to_email, subject, html_body, text_body, attachments=None):
    msg = EmailMultiAlternatives(
        subject=subject, body=text_body, from_email=settings.EMAIL_FROM, to=[to_email],
    )
    msg.attach_alternative(html_body, 'text/html')
    for fn, content, mime in (attachments or []):
        msg.attach(fn, content, mime)
    msg.send(fail_silently=False)


def _send_email(to_email, subject, html_body, text_body, retries=2, attachments=None):
    send = _send_via_resend_http if _use_resend_http() else _send_via_smtp
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            send(to_email, subject, html_body, text_body, attachments)
            return
        except Exception as e:
            last_error = e
            logger.warning('Email send attempt %s/%s to %s failed: %s', attempt, retries, to_email, e)
            if attempt < retries:
                time.sleep(1.5)
    logger.error('Email to %s failed after %s attempts', to_email, retries, exc_info=last_error)
    raise last_error


def _send_email_async(to_email, subject, html_body, text_body, attachments=None):
    def _run():
        from django.db import connections
        try:
            _send_email(to_email, subject, html_body, text_body, attachments=attachments)
        except Exception:
            pass  # already logged with traceback inside _send_email
        finally:
            connections.close_all()
    threading.Thread(target=_run, daemon=True).start()


def send_otp_email(to_email, full_name, otp, subject=None, retries=2):
    store_name = get_store_name()
    subject = subject or f'Verify your {store_name} account'
    text_body = (
        f'Hi {full_name},\n\n'
        f'Your verification code is: {otp}\n\n'
        f'This code expires in 15 minutes. Do not share it with anyone.\n\n'
        f'— {store_name} Team'
    )
    body_html = f'''
      Hi {full_name},<br><br>
      Use the code below to verify your account. It expires in <strong>15 minutes</strong> —
      don't share it with anyone.
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td align="center" style="background:#f2f4f3; border-radius:12px; padding:18px;">
            <span style="font-size:32px; font-weight:bold; letter-spacing:10px; color:{BRAND_COLOR};">{otp}</span>
          </td>
        </tr>
      </table>'''
    html_body = _render_email_html(store_name, 'Verify your account', body_html)
    _send_email(to_email, subject, html_body, text_body, retries=retries)


def send_otp_email_async(to_email, full_name, otp, subject=None):
    """Fire-and-forget: the Gmail SMTP round-trip alone takes 5+ seconds, which is
    long enough to make a synchronous request feel broken. Retries/failures are
    still logged inside send_otp_email; the caller's HTTP response doesn't wait on it."""
    def _run():
        from django.db import connections
        try:
            send_otp_email(to_email, full_name, otp, subject=subject)
        except Exception:
            pass  # already logged with traceback inside send_otp_email
        finally:
            # get_store_name() opens a DB connection on this thread — Django never
            # reclaims it on its own, so it must be closed explicitly here.
            connections.close_all()
    threading.Thread(target=_run, daemon=True).start()


def send_collector_welcome_email(user, raw_password):
    """One-time onboarding email for an admin-created lab collector, sent from
    AdminLabCollectorListView.post(). This is the ONLY place the admin-set password is ever put in
    front of the collector — deliberately by email, never in the persistent in-app Notification row
    (which lives in the DB and is shown on every future login). Fire-and-forget via
    _send_email_async, exactly like every other outbound email in this module."""
    store_name = get_store_name()
    subject = f'Your {store_name} collector account is ready'
    signin_url = f'{FRONTEND_URL}/signin'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'A lab collector account has been created for you on {store_name}. You can sign in with:\n\n'
        f'Email: {user.email}\n'
        f'Temporary password: {raw_password}\n\n'
        f'Please change your password after signing in. Sign in here: {signin_url}\n\n'
        f'— {store_name} Team'
    )
    body_html = f'''
      Hi {user.full_name},<br><br>
      A lab collector account has been created for you on <strong>{store_name}</strong>.
      Use the temporary credentials below to sign in, then change your password from your account settings.
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td style="background:#f2f4f3; border-radius:12px; padding:18px; font-size:14px; color:#1a1c1a;">
            <strong>Email:</strong> {user.email}<br>
            <strong>Temporary password:</strong>
            <span style="font-family:monospace; letter-spacing:0.5px;">{raw_password}</span>
          </td>
        </tr>
      </table>
      For your security, please change this password after your first sign-in.'''
    html_body = _render_email_html(store_name, 'Your collector account is ready', body_html, cta_text='Sign In', cta_url=signin_url)
    _send_email_async(user.email, subject, html_body, text_body)


def send_pharmacy_welcome_email(user, raw_password, pharmacy_name=None):
    """One-time onboarding email for a newly created pharmacy login — both the admin-created
    pharmacy owner (AdminPharmacyListView.post) and an owner-added team member
    (PharmacyTeamListView.post). Same split as send_collector_welcome_email: the admin/owner-set
    password is delivered ONLY here by email, never in the persistent in-app Notification row
    (which lives in the DB and shows on every future login). Fire-and-forget via _send_email_async."""
    store_name = get_store_name()
    where = pharmacy_name or store_name
    subject = f'Your {store_name} pharmacy account is ready'
    signin_url = f'{FRONTEND_URL}/signin'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'A pharmacy account for {where} has been created for you on {store_name}. You can sign in with:\n\n'
        f'Email: {user.email}\n'
        f'Temporary password: {raw_password}\n\n'
        f'Please change your password after signing in. Sign in here: {signin_url}\n\n'
        f'— {store_name} Team'
    )
    body_html = f'''
      Hi {user.full_name},<br><br>
      A pharmacy account for <strong>{where}</strong> has been created for you on <strong>{store_name}</strong>.
      Use the temporary credentials below to sign in, then change your password from your account settings.
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        <tr>
          <td style="background:#f2f4f3; border-radius:12px; padding:18px; font-size:14px; color:#1a1c1a;">
            <strong>Email:</strong> {user.email}<br>
            <strong>Temporary password:</strong>
            <span style="font-family:monospace; letter-spacing:0.5px;">{raw_password}</span>
          </td>
        </tr>
      </table>
      For your security, please change this password after your first sign-in.'''
    html_body = _render_email_html(store_name, 'Your pharmacy account is ready', body_html, cta_text='Sign In', cta_url=signin_url)
    _send_email_async(user.email, subject, html_body, text_body)


def send_lab_report_ready_email(booking):
    """Report Ready email for a lab booking — the actual report file is ATTACHED, so the report
    arrives with the notification rather than as a bare link. Respects the same customer
    LAB_BOOKING_UPDATE email opt-out the generic notify path applies. Reads the report bytes here
    (reports are small, and uploading one is an admin/collector action, not a customer hot path).
    Fire-and-forget via _send_email_async, like every other outbound email here."""
    user = booking.user
    if not _should_email_notification(user, 'LAB_BOOKING_UPDATE'):
        return
    store_name = get_store_name()
    test_name = booking.lab_test.name
    view_url = f'{FRONTEND_URL}/lab-test-bookings'

    attachments = None
    if booking.report_file:
        try:
            booking.report_file.open('rb')
            content = booking.report_file.read()
        finally:
            booking.report_file.close()
        base = os.path.basename(booking.report_file.name) or 'report'
        ext = os.path.splitext(base)[1]
        filename = f'{test_name} Report{ext}' if ext else base
        mime = mimetypes.guess_type(base)[0] or 'application/octet-stream'
        attachments = [(filename, content, mime)]

    has_file = bool(attachments)
    subject = f'Your {test_name} report is ready'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'Your {test_name} report is ready'
        + (' — it is attached to this email.' if has_file else '.') + '\n\n'
        f'You can also view or download it anytime here: {view_url}\n\n'
        f'— {store_name} Team'
    )
    body_html = (
        f'Hi {user.full_name},<br><br>'
        f'Your <strong>{test_name}</strong> report is ready'
        + (' — you’ll find it attached to this email.' if has_file else '.')
        + '<br><br>You can also view or download it anytime from your bookings.'
    )
    html_body = _render_email_html(store_name, 'Your lab report is ready', body_html, cta_text='View Report', cta_url=view_url)
    _send_email_async(user.email, subject, html_body, text_body, attachments=attachments)


def send_prescription_ready_email(prescription):
    """Prescription Ready email for a completed consultation — the generated PDF is ATTACHED, so the
    prescription arrives with the notification rather than as a bare link. Mirrors
    send_lab_report_ready_email: gate on the customer's PRESCRIPTION opt-out, read the file bytes
    here (a completed consultation is a doctor action, not a customer hot path), fire-and-forget via
    _send_email_async. Safe to call even if the PDF failed to save — it just sends the link-only
    variant instead of silently dropping the notification."""
    user = prescription.user
    if not _should_email_notification(user, 'PRESCRIPTION'):
        return
    store_name = get_store_name()
    doctor_label = f'Dr. {prescription.doctor}' if prescription.doctor else 'your doctor'
    view_url = f'{FRONTEND_URL}/prescriptions'

    attachments = None
    if prescription.file:
        try:
            prescription.file.open('rb')
            content = prescription.file.read()
        finally:
            prescription.file.close()
        attachments = [('Prescription.pdf', content, 'application/pdf')]

    has_file = bool(attachments)
    subject = f'Your prescription from {store_name} is ready'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'Your consultation with {doctor_label} is complete and your prescription is ready'
        + (' — it is attached to this email as a PDF.' if has_file else '.') + '\n\n'
        f'You can also view or download it anytime here: {view_url}\n\n'
        f'— {store_name} Team'
    )
    body_html = (
        f'Hi {user.full_name},<br><br>'
        f'Your consultation with <strong>{doctor_label}</strong> is complete and your prescription is ready'
        + (' — you’ll find it attached to this email as a PDF.' if has_file else '.')
        + '<br><br>You can also view or download it anytime from your prescriptions.'
    )
    html_body = _render_email_html(store_name, 'Your prescription is ready', body_html, cta_text='View Prescription', cta_url=view_url)
    _send_email_async(user.email, subject, html_body, text_body, attachments=attachments)


def _admin_wants_notification(user, notif_type):
    """Per-admin category opt-out for _notify_admins() fan-outs. Maps the notif_type an admin
    alert is sent under to the User boolean that governs it; unknown/miscellaneous admin types
    fall under the catch-all 'business' category. default=True on every field means an admin who
    has never touched their preferences keeps receiving everything. getattr guards keep this safe
    for any user row predating the migration."""
    if notif_type in ('NEW_ORDER', 'ORDER_CANCELLED', 'PAYMENT_UPDATE'):
        return getattr(user, 'notif_admin_orders', True)
    if notif_type == 'NEW_LAB_BOOKING':
        return getattr(user, 'notif_admin_lab_bookings', True)
    if notif_type == 'NEW_APPOINTMENT':
        return getattr(user, 'notif_admin_appointments', True)
    if notif_type == 'NEW_PRESCRIPTION':
        return getattr(user, 'notif_admin_prescriptions', True)
    return getattr(user, 'notif_admin_business', True)  # NEW_REVIEW, NEW_SUBSCRIPTION,
    # NEW_PLUS_MEMBER, PHARMACY_*, and any future admin alert type


def _should_email_notification(user, notif_type):
    """Business/operational notifications (pharmacy/doctor/delivery-agent/lab-collector "you have
    work to do" alerts, and every _notify_admins() call) are never gated by these customer-only
    preferences — see pharmax-notification-preferences-spec.md's design decision. That's a role
    check, not a type check: several business-facing notifications reuse a type string that also
    carries a customer preference (e.g. ORDER_CANCELLED/ORDER_UPDATE/FULFILLMENT_UPDATE sent to a
    pharmacy or delivery agent), so gating on type alone would risk silencing an operationally
    critical alert just because it shares a string with a customer-facing one.
    LAB_BOOKING_UPDATE (not just LAB_TEST/REPORT) is matched here since that's the actual type
    string the codebase uses for customer lab-booking notifications — the naive LAB_TEST substring
    alone would never match it."""
    if getattr(user, 'role', None) == 'ADMIN':
        return _admin_wants_notification(user, notif_type)
    if user.role != 'CUSTOMER':
        return True
    if 'ORDER' in notif_type or notif_type == 'PAYMENT_UPDATE':
        return user.notif_order_updates
    if 'PRESCRIPTION' in notif_type:
        return user.notif_prescription_alerts
    if 'DELIVERY' in notif_type:
        return user.notif_delivery_updates
    if 'DOCTOR' in notif_type or 'APPOINTMENT' in notif_type:
        return user.notif_doctor_updates
    if 'LAB_TEST' in notif_type or 'LAB_BOOKING' in notif_type or 'REPORT' in notif_type:
        return user.notif_lab_test_updates
    if 'REMINDER' in notif_type or 'FOLLOW_UP' in notif_type:
        return user.notif_reminders
    return True  # business/operational types (pharmacy/doctor/delivery/collector new-work alerts,
    # admin _notify_admins() calls) fall through here deliberately — unconditional by design, see
    # this spec's stated reasoning, not an oversight. Also catches genuinely customer-facing types
    # with no dedicated preference field (REFERRAL, WALLET, PLUS) — see the Stage 2 audit notes.


def _send_notification_email_async(user, notif_type, title, message, link=None):
    if not _should_email_notification(user, notif_type):
        return
    store_name = get_store_name()
    subject = f'{store_name}: {title}'
    text_body = f'Hi {user.full_name},\n\n{message}\n\n— {store_name} Team'
    body_html = f'Hi {user.full_name},<br><br>{message}'
    cta_url = f'{FRONTEND_URL}{link}' if link else None
    html_body = _render_email_html(store_name, title, body_html, cta_text='View Details' if cta_url else None, cta_url=cta_url)
    _send_email_async(user.email, subject, html_body, text_body)


def notify_user(user, type, title, message, link=None):
    """Drop-in replacement for Notification.objects.create(...) — every in-app notification also
    becomes an email using the exact same title/message/link, so the two channels can never drift
    out of sync. Import deferred like get_store_name()'s, to keep this module import-safe before
    the app registry is ready."""
    from .models import Notification
    n = Notification.objects.create(user=user, type=type, title=title, message=message, link=link)
    _send_notification_email_async(user, type, title, message, link)
    return n


def notify_users_bulk(users, type, title, message, link=None):
    """Same as notify_user() but for _notify_admins()'s fan-out to every admin holding a
    permission — bulk_create for the DB rows, one async email per recipient."""
    from .models import Notification
    users = list(users)
    Notification.objects.bulk_create([
        Notification(user=u, type=type, title=title, message=message, link=link) for u in users
    ])
    for u in users:
        _send_notification_email_async(u, type, title, message, link)
