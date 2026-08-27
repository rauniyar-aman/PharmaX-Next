import os
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
        return SystemSetting.objects.get(key='store_name').value or 'PharmaX'
    except SystemSetting.DoesNotExist:
        return 'PharmaX'


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


def _send_email(to_email, subject, html_body, text_body, retries=2):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            msg = EmailMultiAlternatives(
                subject=subject, body=text_body, from_email=settings.EMAIL_FROM, to=[to_email],
            )
            msg.attach_alternative(html_body, 'text/html')
            msg.send(fail_silently=False)
            return
        except Exception as e:
            last_error = e
            logger.warning('Email send attempt %s/%s to %s failed: %s', attempt, retries, to_email, e)
            if attempt < retries:
                time.sleep(1.5)
    logger.error('Email to %s failed after %s attempts', to_email, retries, exc_info=last_error)
    raise last_error


def _send_email_async(to_email, subject, html_body, text_body):
    def _run():
        from django.db import connections
        try:
            _send_email(to_email, subject, html_body, text_body)
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
