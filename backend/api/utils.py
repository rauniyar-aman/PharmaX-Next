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


def send_order_placed_email_async(user, order):
    """Best-effort receipt email — skipped entirely if the user opted out via notif_order_updates
    (same preference field the in-app notification for this event doesn't yet honor either, but
    email is the more intrusive channel so it's the one worth gating first)."""
    if not user.notif_order_updates:
        return
    store_name = get_store_name()
    short_id = str(order.id)[:8].upper()
    subject = f'Your {store_name} order #{short_id} is confirmed'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'Your order #{short_id} (NPR {order.total_amount}) has been placed successfully.\n'
        f'Track it here: {FRONTEND_URL}/orders/{order.id}\n\n'
        f'— {store_name} Team'
    )
    body_html = (
        f'Hi {user.full_name},<br><br>'
        f'Thanks for your order! We\'ve received <strong>order #{short_id}</strong> for '
        f'<strong>NPR {order.total_amount}</strong> and it\'s now being processed.'
    )
    html_body = _render_email_html(store_name, 'Order placed', body_html, cta_text='View Order', cta_url=f'{FRONTEND_URL}/orders/{order.id}')
    _send_email_async(user.email, subject, html_body, text_body)


def send_order_delivered_email_async(user, order):
    if not user.notif_order_updates:
        return
    store_name = get_store_name()
    short_id = str(order.id)[:8].upper()
    subject = f'Your {store_name} order #{short_id} has arrived'
    text_body = (
        f'Hi {user.full_name},\n\n'
        f'Your order #{short_id} has been delivered. We hope you\'re happy with it!\n'
        f'{FRONTEND_URL}/orders/{order.id}\n\n'
        f'— {store_name} Team'
    )
    body_html = (
        f'Hi {user.full_name},<br><br>'
        f'Your <strong>order #{short_id}</strong> has been delivered. We hope everything arrived in great shape — '
        f'let us know if anything needs a second look.'
    )
    html_body = _render_email_html(store_name, 'Order delivered', body_html, cta_text='View Order', cta_url=f'{FRONTEND_URL}/orders/{order.id}')
    _send_email_async(user.email, subject, html_body, text_body)


def send_prescription_outcome_email_async(user, new_status, message, link=None):
    if not user.notif_prescription_alerts:
        return
    store_name = get_store_name()
    heading = 'Prescription verified' if new_status == 'VERIFIED' else 'Prescription rejected'
    subject = f'{store_name}: {heading}'
    text_body = f'Hi {user.full_name},\n\n{message}\n\n— {store_name} Team'
    body_html = f'Hi {user.full_name},<br><br>{message}'
    cta_url = f'{FRONTEND_URL}{link}' if link else None
    html_body = _render_email_html(store_name, heading, body_html, cta_text='View Details' if cta_url else None, cta_url=cta_url)
    _send_email_async(user.email, subject, html_body, text_body)
