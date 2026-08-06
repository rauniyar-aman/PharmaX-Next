import random
import string
import time
import logging
import threading
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_otp(length=6):
    return ''.join(random.choices(string.digits, k=length))


def get_store_name():
    from .models import SystemSetting
    try:
        return SystemSetting.objects.get(key='store_name').value or 'PharmaX'
    except SystemSetting.DoesNotExist:
        return 'PharmaX'


def send_otp_email(to_email, full_name, otp, subject=None, retries=2):
    store_name = get_store_name()
    subject = subject or f'Verify your {store_name} account'
    body = (
        f'Hi {full_name},\n\n'
        f'Your verification code is: {otp}\n\n'
        f'This code expires in 15 minutes. Do not share it with anyone.\n\n'
        f'— {store_name} Team'
    )
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.EMAIL_FROM,
                recipient_list=[to_email],
                fail_silently=False,
            )
            return
        except Exception as e:
            last_error = e
            logger.warning('OTP email send attempt %s/%s to %s failed: %s', attempt, retries, to_email, e)
            if attempt < retries:
                time.sleep(1.5)
    logger.error('OTP email to %s failed after %s attempts', to_email, retries, exc_info=last_error)
    raise last_error


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
