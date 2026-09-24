import hmac
import hashlib
import base64
import calendar
import json
import logging
import os
import random
import uuid as uuid_lib
import requests
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import datetime, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q, Avg, Count, Sum, F, Max, Min, ProtectedError
from django.db.models.functions import TruncDate
from django.db import transaction, IntegrityError
from django.http import HttpResponseRedirect, HttpResponse
from django.core.files.base import ContentFile
from django.conf import settings
from decimal import Decimal, InvalidOperation

from .models import (
    User, Address, Category, Brand, Medicine, Prescription, PrescriptionMedicineItem, PrescriptionLabTestItem, PrescriptionFile,
    Cart, CartItem, Order, OrderItem, Review, WishlistItem,
    Notification, SystemSetting, StockLog,
    LabTestCategory, LabTest, LabTestBooking, LabBookingGroup, LabReportShare, BlogPost, MedicineSubscription, Doctor, DoctorAvailability, DoctorAppointment, DoctorPayout,
    PlusPlan, PlusMembership, PlusBenefit, DoctorReview, HealthRecord, MedicineReminder, ReminderLog,
    Coupon, CouponUsage, Wallet, WalletTransaction, Referral, Permission,
    Pharmacy, DeliveryAgent, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, DeliveryDecline,
    PharmacyPayout, DeliveryAgentEarning, DeliveryAgentCodLiability, PharmacyTeamMember, PharmacyBusinessHours,
    LabCollector, CollectorEarning, CollectorCodLiability,
    PharmacyDocument, PharmacyLocationChangeRequest,
    FeaturedDeal, PromoBanner,
    PharmacyIncentiveCampaign, PharmacyCampaignEnrollment,
    DoctorProfileChangeRequest, DoctorDocument,
)
from .serializers import (
    RegisterSerializer, OTPVerifySerializer, ResendOTPSerializer,
    LoginSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    CategorySerializer, BrandSerializer, MedicineListSerializer, MedicineDetailSerializer,
    AddressSerializer, PrescriptionSerializer, PrescriptionMedicineItemSerializer, PrescriptionLabTestItemSerializer, LabReportShareSerializer, CartSerializer,
    CartItemSerializer, OrderSerializer, ReviewSerializer, MyReviewSerializer,
    NotificationSerializer, StockLogSerializer, SystemSettingSerializer,
    LabTestCategorySerializer, LabTestListSerializer, LabTestDetailSerializer, LabTestBookingSerializer, LabBookingGroupSerializer,
    BlogPostListSerializer, BlogPostDetailSerializer, MedicineSubscriptionSerializer,
    DoctorSerializer, DoctorAvailabilitySerializer, DoctorAppointmentSerializer,
    DoctorPayoutSerializer, AdminDoctorPayoutSerializer,
    AdminDoctorSerializer, AdminDoctorCreateSerializer, AdminDoctorLinkAccountSerializer,
    PlusPlanSerializer, PlusMembershipSerializer, PlusBenefitSerializer,
    DoctorReviewSerializer, MyDoctorReviewSerializer, HealthRecordSerializer,
    MedicineReminderSerializer, ReminderLogSerializer,
    CouponSerializer, WalletSerializer, WalletTransactionSerializer, ReferralSerializer,
    FeaturedDealSerializer, PromoBannerSerializer,
    PermissionSerializer, AdminUserSerializer, AdminUserCreateSerializer,
    AdminPharmacySerializer, AdminPharmacyCreateSerializer,
    AdminDeliveryAgentSerializer, AdminDeliveryAgentCreateSerializer,
    PharmacyListingSerializer, PharmacyListingCreateSerializer,
    PharmacyFulfillmentRequestSerializer, PharmacyOrderFulfillmentSerializer,
    PharmacyTeamMemberSerializer, PharmacyTeamMemberCreateSerializer, AdminOrderFulfillmentSerializer,
    AdminFulfillmentRequestSerializer,
    PharmacyProfileSerializer, PharmacyBusinessHoursSerializer, PharmacyDocumentSerializer,
    PharmacyLocationChangeRequestSerializer,
    DeliveryFulfillmentSerializer, DeliveryActiveSerializer,
    AdminPharmacyPayoutSerializer, AdminDeliveryAgentEarningSerializer, AdminDeliveryAgentCodLiabilitySerializer,
    AdminCollectorEarningSerializer, AdminCollectorCodLiabilitySerializer,
    AdminChannelOrderSerializer, AdminChannelLabBookingSerializer, AdminChannelAppointmentSerializer,
    AdminLabCollectorSerializer, AdminLabCollectorCreateSerializer,
    PharmacyIncentiveCampaignSerializer, PharmacyCampaignEnrollmentSerializer,
    DoctorProfileChangeRequestSerializer, DoctorDocumentSerializer,
)
from .utils import generate_otp, send_otp_email_async, get_store_name, notify_user, notify_users_bulk, _admin_wants_notification, send_collector_welcome_email, send_pharmacy_welcome_email, send_doctor_welcome_email, send_lab_report_ready_email, send_prescription_ready_email
from .permissions import IsAdmin, IsSuperAdmin, IsPharmacy, IsDeliveryAgent, IsDoctor, IsCollector, require_permission
from .geo import check_address_serviceable, service_area_config
from . import imports as bulk_imports
from .throttles import AuthRateThrottle
from .matching import (
    broadcast_order, sync_order_status, expire_stale_fulfillment_requests, expire_stale_delivery_broadcasts,
    pharmacy_accept_item, pharmacy_decline_item, pharmacy_advance_fulfillment, pharmacy_verify_pickup_code,
    pharmacy_review_prescription,
    delivery_agent_accept, update_agent_location, collect_cash, mark_delivered, _agent_eligible_for,
    _tracking_payload, widen_stale_priority_broadcasts, _fulfillment_prescription_ready, broadcast_delivery,
    annotate_medicine_availability, _broadcast_radius_km,
)
from .scheduling import get_available_slots
from .video import ensure_meeting_link as _ensure_meeting_link
from .lab_collection import (
    collector_confirm_sample_collected, collector_mark_en_route,
    collector_mark_arrived, collector_mark_submitted_to_lab,
    collector_tracking_payload,
)
from .pdf import build_prescription_pdf

logger = logging.getLogger(__name__)

# Everything DoctorAppointmentSerializer.get_prescription() reads. Without it, listing appointments
# costs four extra queries per row once the consultation record carries item names rather than
# counts — invisible on a dev database, brutal on the admin list, which is unpaginated.
APPOINTMENT_PRESCRIPTION_PREFETCH = (
    'prescription__medicine_items__medicine',
    'prescription__lab_test_items__lab_test',
    'prescription__lab_test_items__booking',
)

FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8001')

ESEWA_PRODUCT_CODE = os.getenv('ESEWA_PRODUCT_CODE', 'EPAYTEST')
ESEWA_SECRET_KEY = os.getenv('ESEWA_SECRET_KEY', '8gBm/:&EnhH.1/q')
ESEWA_FORM_URL = os.getenv('ESEWA_FORM_URL', 'https://rc-epay.esewa.com.np/api/epay/main/v2/form')
ESEWA_VERIFY_URL = os.getenv('ESEWA_VERIFY_URL', 'https://rc-epay.esewa.com.np/api/epay/transaction/status/')

KHALTI_SECRET_KEY = os.getenv('KHALTI_SECRET_KEY', 'test_secret_key_f59e8b7d18b4499ca40f68195a846e9')
KHALTI_API_URL = os.getenv('KHALTI_API_URL', 'https://dev.khalti.com/api/v2')


def _tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def _handle_wrong_otp(user):
    attempts = (user.otp_attempts or 0) + 1
    if attempts >= 5:
        user.otp_attempts = 0
        user.otp_locked_until = timezone.now() + timedelta(minutes=15)
        user.save(update_fields=['otp_attempts', 'otp_locked_until'])
        return Response(
            {'success': False, 'message': 'Too many incorrect attempts. Please request a new code after some time.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    user.otp_attempts = attempts
    user.save(update_fields=['otp_attempts'])
    return None


# ─── Auth ─────────────────────────────────────────────────────────────────────

def _generate_referral_code(full_name):
    base = ''.join(ch for ch in full_name.upper() if ch.isalnum())[:6] or 'USER'
    while True:
        code = f'{base}{random.randint(100, 999)}'
        if not User.objects.filter(referral_code=code).exists():
            return code


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        existing = User.objects.filter(email=request.data.get('email')).first()
        if existing and existing.is_deleted:
            return Response({
                'success': False, 'code': 'ACCOUNT_DELETED',
                'message': 'An account with this email was previously deleted.',
                'data': {'email': existing.email},
            }, status=status.HTTP_409_CONFLICT)

        s = RegisterSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        referrer = None
        referral_code = s.validated_data.get('referral_code', '').strip()
        if referral_code:
            referrer = User.objects.filter(referral_code__iexact=referral_code).first()
            if not referrer:
                return Response({'success': False, 'message': 'Invalid referral code.'}, status=status.HTTP_400_BAD_REQUEST)

        otp = generate_otp()
        user = User.objects.create_user(
            email=s.validated_data['email'],
            full_name=s.validated_data['full_name'],
            phone=s.validated_data['phone'],
            password=s.validated_data['password'],
            otp_code=otp,
            otp_expires_at=timezone.now() + timedelta(minutes=15),
            otp_attempts=0,
            otp_locked_until=None,
            is_active=False,
        )
        user.referral_code = _generate_referral_code(user.full_name)
        user.save(update_fields=['referral_code'])

        if referrer:
            Referral.objects.create(referrer=referrer, referred_user=user)

        send_otp_email_async(user.email, user.full_name, otp)
        return Response({'success': True, 'message': 'OTP sent to your email. Please verify.'}, status=status.HTTP_201_CREATED)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        s = OTPVerifySerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=s.validated_data['email'])
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user.otp_locked_until and timezone.now() < user.otp_locked_until:
            return Response({'success': False, 'message': 'Account temporarily locked. Please request a new code.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if not user.otp_code or user.otp_expires_at < timezone.now():
            return Response({'success': False, 'message': 'OTP has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.otp_code != s.validated_data['otp']:
            err = _handle_wrong_otp(user)
            return err or Response({'success': False, 'message': 'Incorrect OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        user.is_email_verified = True
        user.is_active = True
        user.otp_code = None
        user.otp_expires_at = None
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['is_email_verified', 'is_active', 'otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        return Response({'success': True, 'message': 'Email verified.', 'tokens': _tokens(user), 'user': UserProfileSerializer(user).data})


class ResendOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        s = ResendOTPSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=s.validated_data['email'])
        except User.DoesNotExist:
            return Response({'success': True, 'message': 'If the email exists, a new OTP has been sent.'})
        if user.is_email_verified:
            return Response({'success': False, 'message': 'Email already verified.'}, status=status.HTTP_400_BAD_REQUEST)
        otp = generate_otp()
        user.otp_code = otp
        user.otp_expires_at = timezone.now() + timedelta(minutes=15)
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        send_otp_email_async(user.email, user.full_name, otp)
        return Response({'success': True, 'message': 'OTP resent.'})


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=s.validated_data['email'])
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.check_password(s.validated_data['password']):
            return Response({'success': False, 'message': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_email_verified:
            return Response({'success': False, 'message': 'Please verify your email first.'}, status=status.HTTP_403_FORBIDDEN)
        if user.is_deleted:
            return Response({
                'success': False, 'code': 'ACCOUNT_DELETED',
                'message': 'This account has been deleted.',
                'data': {'email': user.email},
            }, status=status.HTTP_410_GONE)
        if not user.is_active:
            return Response({
                'success': False, 'code': 'ACCOUNT_DEACTIVATED',
                'message': 'This account is deactivated.',
                'data': {'email': user.email},
            }, status=status.HTTP_403_FORBIDDEN)
        return Response({'success': True, 'tokens': _tokens(user), 'user': UserProfileSerializer(user).data})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'success': True, 'data': {'user': UserProfileSerializer(request.user).data}})

    def put(self, request):
        s = UserProfileSerializer(request.user, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'user': s.data}})

    def delete(self, request):
        user = request.user
        user.is_deleted = True
        user.deleted_at = timezone.now()
        user.is_active = False
        user.save(update_fields=['is_deleted', 'deleted_at', 'is_active'])
        return Response({'success': True, 'message': 'Account deleted.'})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        s = ForgotPasswordSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=s.validated_data['email'], is_deleted=False)
        except User.DoesNotExist:
            return Response({'success': True, 'message': 'If the email exists, a reset code has been sent.'})
        otp = generate_otp()
        user.otp_code = otp
        user.otp_expires_at = timezone.now() + timedelta(minutes=15)
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        send_otp_email_async(user.email, user.full_name, otp, subject=f'Reset your {get_store_name()} password')
        return Response({'success': True, 'message': 'Reset code sent to your email.'})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=s.validated_data['email'])
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user.otp_locked_until and timezone.now() < user.otp_locked_until:
            return Response({'success': False, 'message': 'Too many attempts. Try again later.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if not user.otp_code or user.otp_expires_at < timezone.now():
            return Response({'success': False, 'message': 'Code has expired. Request a new one.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.otp_code != s.validated_data['otp']:
            err = _handle_wrong_otp(user)
            return err or Response({'success': False, 'message': 'Incorrect code.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(s.validated_data['new_password'])
        user.otp_code = None
        user.otp_expires_at = None
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['password', 'otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        return Response({'success': True, 'message': 'Password reset successful.'})


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(s.validated_data['current_password']):
            return Response({'success': False, 'message': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(s.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        return Response({'success': True, 'message': 'Password changed.'})


class AvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.core.files.storage import FileSystemStorage

        file = request.FILES.get('avatar')
        if not file:
            return Response({'success': False, 'message': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or GIF images are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 3 * 1024 * 1024:
            return Response({'success': False, 'message': 'Image must be under 3MB.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower() or '.jpg'
        filename = f'avatar_{request.user.id}{ext}'
        storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'avatars'))
        if storage.exists(filename):
            storage.delete(filename)
        storage.save(filename, file)

        request.user.avatar_url = f'/media/avatars/{filename}'
        request.user.save(update_fields=['avatar_url'])
        return Response({'success': True, 'user': UserProfileSerializer(request.user).data, 'message': 'Profile picture updated.'})

    def delete(self, request):
        from django.core.files.storage import FileSystemStorage

        if request.user.avatar_url:
            storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'avatars'))
            filename = request.user.avatar_url.rsplit('/', 1)[-1]
            if storage.exists(filename):
                storage.delete(filename)
        request.user.avatar_url = None
        request.user.save(update_fields=['avatar_url'])
        return Response({'success': True, 'message': 'Profile picture removed.'})


class DeactivateAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.is_active = False
        request.user.save(update_fields=['is_active'])
        return Response({'success': True, 'message': 'Account deactivated. Sign in again anytime to reactivate.'})


class RestoreRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'success': False, 'message': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'No account found with this email.'}, status=status.HTTP_404_NOT_FOUND)
        if user.is_active and not user.is_deleted:
            return Response({'success': False, 'message': 'This account is already active.'}, status=status.HTTP_400_BAD_REQUEST)

        otp = generate_otp()
        user.otp_code = otp
        user.otp_expires_at = timezone.now() + timedelta(minutes=15)
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        send_otp_email_async(user.email, user.full_name, otp, subject=f'Restore your {get_store_name()} account')
        return Response({'success': True, 'message': 'Verification code sent to your email.'})


class RestoreConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        email = request.data.get('email')
        otp = request.data.get('otp')
        if not email or not otp:
            return Response({'success': False, 'message': 'Email and OTP are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.otp_code:
            return Response({'success': False, 'message': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)
        if user.otp_locked_until and timezone.now() < user.otp_locked_until:
            return Response({'success': False, 'message': 'Too many incorrect attempts. Please request a new code after some time.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if user.otp_code != otp:
            err = _handle_wrong_otp(user)
            return err or Response({'success': False, 'message': 'Invalid code. Please check and try again.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.otp_expires_at or user.otp_expires_at < timezone.now():
            return Response({'success': False, 'message': 'Code has expired. Request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_deleted = False
        user.deleted_at = None
        user.is_active = True
        user.otp_code = None
        user.otp_expires_at = None
        user.otp_attempts = 0
        user.otp_locked_until = None
        user.save(update_fields=['is_deleted', 'deleted_at', 'is_active', 'otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until'])
        return Response({'success': True, 'message': 'Account restored! Welcome back.', 'tokens': _tokens(user), 'user': UserProfileSerializer(user).data})


class PublicSettingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        rows = SystemSetting.objects.filter(key__in=['store_name', 'support_email', 'support_phone'])
        settings_map = {r.key: r.value for r in rows}
        return Response({'success': True, 'data': {
            'store_name': settings_map.get('store_name') or 'Swasthaya',
            'support_email': settings_map.get('support_email'),
            'support_phone': settings_map.get('support_phone'),
        }})


class PublicServiceAreaView(APIView):
    """Public read of the serviceable-area config (districts + coverage circles) so the storefront
    can badge/disable out-of-area addresses and message the customer before they hit the
    authoritative server-side gate. Physical fulfillment only — consult is nationwide."""
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'success': True, 'data': service_area_config()})


class HomeShowcaseView(APIView):
    """Public homepage stats + testimonials from live data. On a fresh DB these are
    genuinely zero / empty — the frontend renders the real numbers and hides the
    testimonials section when there are none, rather than showing invented figures."""
    permission_classes = [AllowAny]

    def get(self, request):
        delivered = Order.objects.filter(status='DELIVERED')
        cities_served = (
            delivered.exclude(address__city__isnull=True)
                     .exclude(address__city='')
                     .values('address__city').distinct().count()
        )
        stats = {
            'happy_customers': User.objects.filter(role='CUSTOMER', is_active=True, is_deleted=False).count(),
            'orders_delivered': delivered.count(),
            'medicines_available': Medicine.objects.filter(in_stock=True).count(),
            'cities_served': cities_served,
        }

        reviews = (
            Review.objects.filter(rating__gte=4)
                  .exclude(comment__isnull=True).exclude(comment='')
                  .select_related('user')
                  .order_by('-created_at')[:6]
        )
        testimonials = [
            {'name': r.user.full_name, 'rating': r.rating, 'comment': r.comment}
            for r in reviews
        ]

        return Response({'success': True, 'data': {'stats': stats, 'testimonials': testimonials}})


# ─── Categories ───────────────────────────────────────────────────────────────

class CategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = Category.objects.filter(is_active=True).order_by('name')
        return Response({'success': True, 'data': {'categories': CategorySerializer(categories, many=True).data}})


# ─── Medicines ────────────────────────────────────────────────────────────────

def _parse_geo(request):
    """(lat, lng) floats from the request query params, or None when absent/invalid. The catalog
    is location-aware only when both are present — the storefront sends them from the visitor's
    saved/detected location (useLocationStore); with no location we fall back to the full,
    unfiltered catalog."""
    lat, lng = request.query_params.get('lat'), request.query_params.get('lng')
    if lat in (None, '') or lng in (None, ''):
        return None
    try:
        return float(lat), float(lng)
    except (TypeError, ValueError):
        return None


class MedicineListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Medicine.objects.select_related('category', 'brand').all()

        search = request.query_params.get('search', '').strip()
        category = request.query_params.get('category', '').strip()
        brand = request.query_params.get('brand', '').strip()
        type_ = request.query_params.get('type', '').strip()
        in_stock = request.query_params.get('inStock', '').strip()
        availability = request.query_params.get('availability', '').strip()
        price_ranges = request.query_params.get('priceRanges', '').strip()
        min_price = request.query_params.get('minPrice')
        max_price = request.query_params.get('maxPrice')
        min_rating = request.query_params.get('minRating')
        sort = request.query_params.get('sortBy', 'popular')
        geo = _parse_geo(request)

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__name__icontains=search) | Q(manufacturer__icontains=search))
        if category:
            names = [c.strip() for c in category.split(',') if c.strip()]
            if names:
                qs = qs.filter(category__name__in=names)
        if brand:
            brand_names = [b.strip() for b in brand.split(',') if b.strip()]
            if brand_names:
                qs = qs.filter(brand__name__in=brand_names)
        if type_:
            types = [t.strip() for t in type_.split(',') if t.strip() in ('Rx', 'OTC')]
            if len(types) == 1:
                qs = qs.filter(type=types[0])

        # Legacy single-value availability param (kept for backwards compatibility)
        if in_stock == 'true':
            qs = qs.filter(in_stock=True)
        elif in_stock == 'false':
            qs = qs.filter(in_stock=False)
        # Multi-select availability checkboxes: only constrain if exactly one is checked
        if availability:
            avail_vals = set(a.strip() for a in availability.split(',') if a.strip())
            if avail_vals == {'in-stock'}:
                qs = qs.filter(in_stock=True)
            elif avail_vals == {'out-of-stock'}:
                qs = qs.filter(in_stock=False)

        if price_ranges:
            bucket_q = Q()
            has_bucket = False
            for bucket in price_ranges.split(','):
                bucket = bucket.strip()
                if bucket == 'under-100':
                    bucket_q |= Q(price__lt=100)
                    has_bucket = True
                elif bucket == '100-300':
                    bucket_q |= Q(price__gte=100, price__lte=300)
                    has_bucket = True
                elif bucket == 'over-300':
                    bucket_q |= Q(price__gt=300)
                    has_bucket = True
            if has_bucket:
                qs = qs.filter(bucket_q)
        if min_price:
            qs = qs.filter(price__gte=Decimal(min_price))
        if max_price:
            qs = qs.filter(price__lte=Decimal(max_price))
        if min_rating:
            try:
                qs = qs.filter(rating__gte=Decimal(min_rating))
            except Exception:
                pass

        # Location-aware availability: keep only medicines a verified + active pharmacy can deliver
        # to this visitor (express within the broadcast radius, else same-day citywide) and expose
        # the tier via the serializer. No location → full catalog, unchanged (browse mode).
        radius_km = None
        if geo:
            radius_km = _broadcast_radius_km()
            qs = annotate_medicine_availability(qs, geo[0], geo[1]).filter(nearest_km__isnull=False)
            if request.query_params.get('deliveryTier', '').strip() == 'express':
                qs = qs.filter(nearest_km__lte=radius_km)

        sort_map = {
            'popular': '-total_reviews',
            'price-asc': 'price',
            'price-desc': '-price',
            'rating': '-rating',
            'newest': '-created_at',
            'name': 'name',
        }
        if geo and sort == 'nearest':
            qs = qs.order_by('nearest_km')
        else:
            qs = qs.order_by(sort_map.get(sort, '-total_reviews'))

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(100, max(1, int(request.query_params.get('limit', 12))))
        except ValueError:
            page, limit = 1, 12

        total = qs.count()
        start = (page - 1) * limit
        medicines = qs[start:start + limit]
        ctx = {'radius_km': radius_km} if geo else {}

        return Response({
            'success': True,
            'data': {
                'medicines': MedicineListSerializer(medicines, many=True, context=ctx).data,
                'pagination': {
                    'total': total,
                    'page': page,
                    'limit': limit,
                    'totalPages': (total + limit - 1) // limit,
                },
            },
        })


class MedicineBrandsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Brand.objects.filter(is_active=True).annotate(medicine_count=Count('medicines')).order_by('name')
        brands = [{'id': str(b.id), 'name': b.name, 'logo_url': b.logo_url, 'medicine_count': b.medicine_count} for b in qs]
        return Response({'success': True, 'data': {'brands': brands}})


class MedicineDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        # Annotate nearest_km when the visitor shares a location so the detail page can show the
        # express / same-day tier. We still return the medicine even if no pharmacy stocks it, so
        # shared/refreshed deep links never 404 — the serializer just reports delivery_tier: null.
        geo = _parse_geo(request)
        qs = Medicine.objects.select_related('category', 'brand')
        radius_km = None
        if geo:
            radius_km = _broadcast_radius_km()
            qs = annotate_medicine_availability(qs, geo[0], geo[1])
        try:
            medicine = qs.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        ctx = {'radius_km': radius_km} if geo else {}
        data = MedicineDetailSerializer(medicine, context=ctx).data
        data['has_purchased'] = _user_has_purchased(request.user, medicine)
        return Response({'success': True, 'data': {'medicine': data}})


RATING_STEP_ERROR = 'Rating must be between 0.5 and 5 in steps of 0.5.'


def _parse_rating(raw):
    """Parses a user-submitted star rating that may carry a half step (3.5, 4.5, …).

    Returns the Decimal on success or None on any rejection — callers answer with
    RATING_STEP_ERROR so the one wording covers every rating endpoint. Quantizing to one decimal
    place before the modulo check means 4.50 and '4.5' both land on the same value, while 4.3 or 6
    are refused. The columns are Decimal(2,1), so anything that passes here stores exactly.
    """
    if raw is None or raw == '':
        return None
    try:
        value = Decimal(str(raw)).quantize(Decimal('0.1'))
    except (InvalidOperation, ValueError, TypeError):
        return None
    # NaN slips through both Decimal() and quantize() and only blows up on the comparison below, so
    # it has to be refused by name. It is reachable: the string 'NaN' from a form post is a valid
    # Decimal. (Infinity raises inside quantize() and is already caught above.)
    if not value.is_finite():
        return None
    if value < Decimal('0.5') or value > Decimal('5') or value % Decimal('0.5') != 0:
        return None
    return value


def _recalc_medicine_rating(medicine):
    agg = Review.objects.filter(medicine=medicine).aggregate(avg=Avg('rating'), cnt=Count('id'))
    medicine.rating = round(agg['avg'] or 0, 2)
    medicine.total_reviews = agg['cnt']
    medicine.save(update_fields=['rating', 'total_reviews'])


class MedicineReviewsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        reviews = Review.objects.filter(medicine_id=pk).select_related('user').order_by('-created_at')
        return Response({'success': True, 'data': {'reviews': ReviewSerializer(reviews, many=True, context={'request': request}).data}})

    def post(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            medicine = Medicine.objects.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)

        rating = _parse_rating(request.data.get('rating'))
        comment = request.data.get('comment', '')
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        review, created = Review.objects.update_or_create(
            user=request.user, medicine=medicine,
            defaults={'rating': rating, 'comment': comment},
        )
        _recalc_medicine_rating(medicine)
        if created:
            # normalize() so a whole rating reads "4-star" rather than "4.0-star"; a half step keeps its .5.
            _notify_admins('manage_inventory', 'NEW_REVIEW', 'New Product Review',
                            f'{request.user.full_name} left a {rating.normalize()}-star review on {medicine.name}.', link='/admin/medicines')

        return Response({'success': True, 'data': {'review': ReviewSerializer(review, context={'request': request}).data}}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def put(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            review = Review.objects.get(medicine_id=pk, user=request.user)
        except Review.DoesNotExist:
            return Response({'success': False, 'message': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)

        rating = _parse_rating(request.data.get('rating'))
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        review.rating = rating
        review.comment = request.data.get('comment', review.comment)
        review.save(update_fields=['rating', 'comment'])
        _recalc_medicine_rating(review.medicine)

        return Response({'success': True, 'data': {'review': ReviewSerializer(review, context={'request': request}).data}, 'message': 'Review updated.'})

    def delete(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            review = Review.objects.get(medicine_id=pk, user=request.user)
        except Review.DoesNotExist:
            return Response({'success': False, 'message': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
        medicine = review.medicine
        review.delete()
        _recalc_medicine_rating(medicine)
        return Response({'success': True, 'message': 'Review deleted.'})


class MyReviewsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reviews = Review.objects.filter(user=request.user).select_related('medicine', 'medicine__category').order_by('-created_at')
        return Response({'success': True, 'data': {'reviews': MyReviewSerializer(reviews, many=True, context={'request': request}).data}})


# ─── Cart ─────────────────────────────────────────────────────────────────────

class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response({'success': True, 'data': {'cart': CartSerializer(cart).data}})

    def delete(self, request):
        Cart.objects.filter(user=request.user).delete()
        return Response({'success': True, 'message': 'Cart cleared.'})


def _add_to_cart(user, medicine, quantity):
    """Adds `quantity` of `medicine` to `user`'s cart, incrementing the existing line if already present."""
    cart, _ = Cart.objects.get_or_create(user=user)
    item, created = CartItem.objects.get_or_create(cart=cart, medicine=medicine, defaults={'quantity': quantity})
    if not created:
        item.quantity += quantity
        item.save(update_fields=['quantity'])
    return cart


class CartItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        medicine_id = request.data.get('medicineId') or request.data.get('medicine_id')
        quantity = int(request.data.get('quantity', 1))
        if not medicine_id:
            return Response({'success': False, 'message': 'medicineId is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            medicine = Medicine.objects.get(id=medicine_id)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)

        cart = _add_to_cart(request.user, medicine, quantity)
        return Response({'success': True, 'data': {'cart': CartSerializer(cart).data}}, status=status.HTTP_201_CREATED)

    def put(self, request, pk):
        quantity = int(request.data.get('quantity', 1))
        if quantity < 1:
            return Response({'success': False, 'message': 'Quantity must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cart = Cart.objects.get(user=request.user)
            item = CartItem.objects.get(id=pk, cart=cart)
        except (Cart.DoesNotExist, CartItem.DoesNotExist):
            return Response({'success': False, 'message': 'Cart item not found.'}, status=status.HTTP_404_NOT_FOUND)
        item.quantity = quantity
        item.save(update_fields=['quantity'])
        return Response({'success': True, 'data': {'cart': CartSerializer(cart).data}})

    def delete(self, request, pk):
        try:
            cart = Cart.objects.get(user=request.user)
            CartItem.objects.filter(id=pk, cart=cart).delete()
        except Cart.DoesNotExist:
            pass
        cart = Cart.objects.filter(user=request.user).first()
        return Response({'success': True, 'data': {'cart': CartSerializer(cart).data if cart else None}})


# ─── Wishlist ─────────────────────────────────────────────────────────────────

class WishlistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = WishlistItem.objects.filter(user=request.user).select_related('medicine__category', 'medicine__brand').order_by('-added_at')
        medicines = [MedicineListSerializer(i.medicine).data for i in items]
        return Response({'success': True, 'data': {'wishlist': medicines}})


class WishlistItemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, medicine_id):
        try:
            medicine = Medicine.objects.get(id=medicine_id)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        WishlistItem.objects.get_or_create(user=request.user, medicine=medicine)
        return Response({'success': True, 'message': 'Added to wishlist.'})

    def delete(self, request, medicine_id):
        WishlistItem.objects.filter(user=request.user, medicine_id=medicine_id).delete()
        return Response({'success': True, 'message': 'Removed from wishlist.'})


# ─── Addresses ────────────────────────────────────────────────────────────────

class AddressListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        addresses = Address.objects.filter(user=request.user).order_by('-is_default', 'label')
        return Response({'success': True, 'data': {'addresses': AddressSerializer(addresses, many=True).data}})

    def post(self, request):
        s = AddressSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        if s.validated_data.get('is_default'):
            Address.objects.filter(user=request.user).update(is_default=False)
        address = s.save(user=request.user)
        return Response({'success': True, 'data': {'address': AddressSerializer(address).data}}, status=status.HTTP_201_CREATED)


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            address = Address.objects.get(id=pk, user=request.user)
        except Address.DoesNotExist:
            return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'address': AddressSerializer(address).data}})

    def put(self, request, pk):
        try:
            address = Address.objects.get(id=pk, user=request.user)
        except Address.DoesNotExist:
            return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = AddressSerializer(address, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        if s.validated_data.get('is_default'):
            Address.objects.filter(user=request.user).update(is_default=False)
        s.save()
        return Response({'success': True, 'data': {'address': s.data}})

    def delete(self, request, pk):
        Address.objects.filter(id=pk, user=request.user).delete()
        return Response({'success': True, 'message': 'Address deleted.'})


# ─── Prescriptions ────────────────────────────────────────────────────────────

def _prescription_visibility_filter():
    """Hides checkout-draft prescriptions until they're actually tied to a real order — a
    checkout_draft prescription the customer uploaded but then abandoned before ever placing an
    order is genuine noise admin shouldn't see. But once ANY order references it (via either the
    order-level link or a per-medicine one), it's no longer a throwaway draft: that covers an
    order still awaiting/rejected on this exact prescription (which needs review to ever
    progress), and equally an order that already ran its course (paid, or NO_PHARMACY_FOUND,
    or cancelled) — narrowing this to specific order statuses proved too easy to leave stale
    prescriptions invisible whenever the order's status moved on for unrelated reasons."""
    linked_to_order = Q(orders__isnull=False) | Q(order_items__isnull=False)
    return Q(checkout_draft=False) | linked_to_order


class PrescriptionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Shows every prescription the customer has ever uploaded, including checkout drafts —
        # they should be able to browse and view those later regardless of whether that
        # particular order went through. (Admin's queue still hides drafts via
        # _prescription_visibility_filter() until they're tied to a real order.)
        prescriptions = Prescription.objects.filter(user=request.user).order_by('-uploaded_at').prefetch_related(
            'medicine_items', 'extra_files', 'order_items__order', 'orders',
        )
        return Response({'success': True, 'data': {'prescriptions': PrescriptionSerializer(prescriptions, many=True).data}})

    def post(self, request):
        files = request.FILES.getlist('files') or ([request.FILES['file']] if request.FILES.get('file') else [])
        if not files:
            return Response({'success': False, 'message': 'At least one file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > 10:
            return Response({'success': False, 'message': 'You can upload up to 10 files at once.'}, status=status.HTTP_400_BAD_REQUEST)

        checkout_draft = str(request.data.get('checkout_draft', '')).lower() == 'true'
        # group_as_one: these files are multiple pages/scans of ONE prescription (e.g. a
        # multi-page PDF split into images) rather than a batch of separate prescriptions —
        # the primary file becomes Prescription.file, the rest attach as PrescriptionFile rows.
        group_as_one = str(request.data.get('group_as_one', '')).lower() == 'true'

        if group_as_one:
            primary, *extra = files
            prescription = Prescription.objects.create(
                user=request.user,
                file=primary,
                file_name=primary.name,
                notes=request.data.get('notes', ''),
                doctor=request.data.get('doctor', ''),
                hospital=request.data.get('hospital', ''),
                checkout_draft=checkout_draft,
            )
            PrescriptionFile.objects.bulk_create([
                PrescriptionFile(prescription=prescription, file=f, file_name=f.name) for f in extra
            ])
            created = [prescription]
        else:
            created = [
                Prescription.objects.create(
                    user=request.user,
                    file=f,
                    file_name=f.name,
                    notes=request.data.get('notes', ''),
                    doctor=request.data.get('doctor', ''),
                    hospital=request.data.get('hospital', ''),
                    checkout_draft=checkout_draft,
                )
                for f in files
            ]

        _notify_admins(
            'manage_prescriptions', 'NEW_PRESCRIPTION', 'New Prescription Uploaded',
            f'{request.user.full_name} uploaded {len(created)} prescription{"s" if len(created) != 1 else ""} for review.',
            link='/admin/prescriptions',
        )

        data = PrescriptionSerializer(created, many=True, context={'request': request}).data
        return Response(
            {'success': True, 'data': {'prescriptions': data, 'prescription': data[0]}},
            status=status.HTTP_201_CREATED,
        )


class PrescriptionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            p = Prescription.objects.get(id=pk, user=request.user)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'prescription': PrescriptionSerializer(p).data}})


class PrescriptionMedicineItemListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk, user=request.user)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'VERIFIED':
            return Response({'success': False, 'message': 'This prescription has not been verified yet.'}, status=status.HTTP_400_BAD_REQUEST)
        items = prescription.medicine_items.select_related('medicine__category', 'medicine__brand').order_by('created_at')
        return Response({'success': True, 'data': {'medicine_items': PrescriptionMedicineItemSerializer(items, many=True).data}})


class PrescriptionMedicineItemConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk, user=request.user)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'VERIFIED':
            return Response({'success': False, 'message': 'This prescription has not been verified yet.'}, status=status.HTTP_400_BAD_REQUEST)

        entries = request.data.get('items')
        if not isinstance(entries, list):
            return Response({'success': False, 'message': "'items' must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        kept_ids = [e.get('medicine_item_id') for e in entries if isinstance(e, dict)]
        db_items = {
            str(i.id): i for i in
            PrescriptionMedicineItem.objects.filter(id__in=kept_ids, prescription=prescription).select_related('medicine')
        }

        cart = Cart.objects.filter(user=request.user).first()
        skipped = []
        added_count = 0
        for entry in entries:
            if not isinstance(entry, dict):
                skipped.append({'medicine_item_id': None, 'reason': 'Invalid entry.'})
                continue
            item_id = entry.get('medicine_item_id')
            db_item = db_items.get(str(item_id))
            if not db_item:
                skipped.append({'medicine_item_id': item_id, 'reason': 'Item does not belong to this prescription.'})
                continue
            try:
                quantity = int(entry.get('quantity', db_item.quantity))
            except (TypeError, ValueError):
                skipped.append({'medicine_item_id': item_id, 'reason': 'Invalid quantity.'})
                continue
            if quantity < 1:
                skipped.append({'medicine_item_id': item_id, 'reason': 'Quantity must be at least 1.'})
                continue
            cart = _add_to_cart(request.user, db_item.medicine, quantity)
            added_count += 1

        if added_count == 0:
            return Response(
                {'success': False, 'message': 'None of the submitted items could be confirmed.', 'data': {'skipped': skipped}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prescription.medicines_reviewed_at = timezone.now()
        prescription.save(update_fields=['medicines_reviewed_at'])

        return Response({'success': True, 'data': {'cart': CartSerializer(cart).data, 'skipped': skipped}})


class PrescriptionLabTestItemListView(APIView):
    """Mirrors PrescriptionMedicineItemListView — patient-scoped, only meaningful once VERIFIED.
    Unlike medicines there's no bulk confirm endpoint here: each suggested test the patient wants
    gets booked individually through the existing POST /lab-tests/bookings/ flow."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk, user=request.user)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'VERIFIED':
            return Response({'success': False, 'message': 'This prescription has not been verified yet.'}, status=status.HTTP_400_BAD_REQUEST)
        items = prescription.lab_test_items.select_related('lab_test__category', 'booking').order_by('created_at')
        return Response({'success': True, 'data': {'lab_test_items': PrescriptionLabTestItemSerializer(items, many=True).data}})


# ─── Orders ───────────────────────────────────────────────────────────────────

def _get_setting(key, default):
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def _has_active_plus(user):
    try:
        membership = PlusMembership.objects.get(user=user)
    except PlusMembership.DoesNotExist:
        return False
    return membership.is_active


def _user_has_plus_benefit(user, key):
    """Whether `user`'s actual active plan grants the specific benefit `key` — not just "do they
    have some active Plus membership" (_has_active_plus() above, still used for the flat delivery-
    charge waiver, which stays a blanket Plus perk). Different plans can carry different benefits
    now (see PlusBenefit), so a basic-tier member without this specific benefit is correctly NOT
    covered even though _has_active_plus(user) would say True."""
    try:
        membership = PlusMembership.objects.select_related('plan').get(user=user)
    except PlusMembership.DoesNotExist:
        return False
    if not membership.is_active:
        return False
    return membership.plan.benefits.filter(key=key, is_active=True).exists()


# Order statuses that represent a genuine, confirmed purchase — excludes BROADCASTING/
# AWAITING_PAYMENT (not yet confirmed) and CANCELLED/RETURNED (reversed).
PURCHASED_ORDER_STATUSES = ['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']


def _user_has_purchased(user, medicine):
    """Whether `user` has ever actually bought `medicine` — used to gate medicine subscriptions
    (auto-refill) to only medicines the customer has purchased before, not anything in the
    catalog."""
    if not user or not user.is_authenticated:
        return False
    return OrderItem.objects.filter(
        order__user=user, medicine=medicine, order__status__in=PURCHASED_ORDER_STATUSES,
    ).exists()


def _notify_admins(permission_code, notif_type, title, message, link=None):
    """Notifies every admin who holds `permission_code`, plus every super admin — except those who
    have muted this notification's category (see _admin_wants_notification). Muted admins are
    filtered out *before* notify_users_bulk, so muting silences the in-app bell entry and the email
    together, not just the email."""
    admins = User.objects.filter(role='ADMIN', is_active=True).filter(
        Q(is_super_admin=True) | Q(permissions__code=permission_code)
    ).distinct()
    recipients = [a for a in admins if _admin_wants_notification(a, notif_type)]
    if recipients:
        notify_users_bulk(recipients, notif_type, title, message, link)


def _validate_coupon(code, user, subtotal):
    """Returns (coupon_or_None, discount_amount, error_message_or_None)."""
    if not code:
        return None, Decimal('0'), None
    try:
        coupon = Coupon.objects.get(code__iexact=code.strip(), is_active=True)
    except Coupon.DoesNotExist:
        return None, Decimal('0'), 'Invalid coupon code.'

    now = timezone.now()
    if not (coupon.valid_from <= now <= coupon.valid_until):
        return None, Decimal('0'), 'This coupon has expired or is not yet active.'
    if subtotal < coupon.min_order_amount:
        return None, Decimal('0'), f'Minimum order of NPR {coupon.min_order_amount} required for this coupon.'
    if coupon.usage_limit is not None and coupon.usages.count() >= coupon.usage_limit:
        return None, Decimal('0'), 'This coupon has reached its usage limit.'
    if coupon.usages.filter(user=user).count() >= coupon.per_user_limit:
        return None, Decimal('0'), 'You have already used this coupon.'

    if coupon.discount_type == 'PERCENTAGE':
        discount = (subtotal * coupon.discount_value / Decimal('100')).quantize(Decimal('0.01'))
        if coupon.max_discount_amount:
            discount = min(discount, coupon.max_discount_amount)
    else:
        discount = coupon.discount_value
    discount = min(discount, subtotal)
    return coupon, discount, None


def _maybe_reward_referral(user):
    try:
        referral = Referral.objects.select_related('referrer').get(referred_user=user, status='PENDING')
    except Referral.DoesNotExist:
        return
    if Order.objects.filter(user=user).count() != 1:
        return

    referrer_bonus = Decimal(_get_setting('referral_bonus_referrer', '100'))
    referee_bonus = Decimal(_get_setting('referral_bonus_referee', '50'))

    referrer_wallet, _ = Wallet.objects.get_or_create(user=referral.referrer)
    referrer_wallet.balance += referrer_bonus
    referrer_wallet.save(update_fields=['balance'])
    WalletTransaction.objects.create(
        wallet=referrer_wallet, type='CREDIT', amount=referrer_bonus,
        reason=f'Referral bonus — {user.full_name} placed their first order',
        balance_after=referrer_wallet.balance,
    )

    referee_wallet, _ = Wallet.objects.get_or_create(user=user)
    referee_wallet.balance += referee_bonus
    referee_wallet.save(update_fields=['balance'])
    WalletTransaction.objects.create(
        wallet=referee_wallet, type='CREDIT', amount=referee_bonus,
        reason='Welcome bonus for using a referral code',
        balance_after=referee_wallet.balance,
    )

    referral.status = 'REWARDED'
    referral.reward_amount = referrer_bonus
    referral.rewarded_at = timezone.now()
    referral.save(update_fields=['status', 'reward_amount', 'rewarded_at'])

    notify_user(
        user=referral.referrer, type='REFERRAL', title='Referral Bonus Earned!',
        message=f'You earned NPR {referrer_bonus} because {user.full_name} placed their first order.',
        link='/referrals',
    )
    notify_user(
        user=user, type='REFERRAL', title='Welcome Bonus Credited!',
        message=f'NPR {referee_bonus} has been added to your wallet as a welcome bonus.',
        link='/wallet',
    )


def _release_order_holds(order):
    """Refunds wallet usage and releases coupon usage for a cancelled/failed order."""
    if order.wallet_used and order.wallet_used > 0:
        wallet, _ = Wallet.objects.get_or_create(user=order.user)
        wallet.balance += order.wallet_used
        wallet.save(update_fields=['balance'])
        WalletTransaction.objects.create(
            wallet=wallet, type='CREDIT', amount=order.wallet_used,
            reason=f'Refund for cancelled order #{str(order.id)[:8]}',
            balance_after=wallet.balance, order=order,
        )
        order.wallet_used = Decimal('0')
        order.save(update_fields=['wallet_used'])
    CouponUsage.objects.filter(order=order).delete()


def _create_order_from_cart(user, address_id, prescription_id, payment_method, notes='',
                             payment_status='PENDING', order_status='PLACED', clear_cart=True,
                             coupon_code=None, use_wallet=False):
    """Returns (order, error_response). Exactly one is None.

    Legacy single-warehouse path (creates a fully-formed, immediately-PLACED order and decrements
    Medicine.stock_quantity directly) — no longer called by any payment view as of Stage 3 of the
    marketplace spec. Left in place rather than deleted since removing it wasn't asked for; every
    caller now goes through OrderCheckoutView + broadcast_order() instead, which does not touch
    Medicine.stock_quantity at all (stock lives on PharmacyMedicineListing under the marketplace
    model, decremented by pharmacy_accept_item()).
    """
    try:
        cart = Cart.objects.prefetch_related('items__medicine').get(user=user)
    except Cart.DoesNotExist:
        return None, Response({'success': False, 'message': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

    items = cart.items.all()
    if not items.exists():
        return None, Response({'success': False, 'message': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

    address = None
    if address_id:
        try:
            address = Address.objects.get(id=address_id, user=user)
        except Address.DoesNotExist:
            return None, Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

    prescription = None
    if prescription_id:
        try:
            prescription = Prescription.objects.get(id=prescription_id, user=user)
        except Prescription.DoesNotExist:
            pass

    with transaction.atomic():
        total = sum(item.medicine.price * item.quantity for item in items)
        free_threshold = Decimal(_get_setting('free_delivery_threshold', '500'))
        delivery_charge_setting = Decimal(_get_setting('delivery_charge', '50'))
        delivery = Decimal('0') if (total >= free_threshold or _has_active_plus(user)) else delivery_charge_setting

        coupon, coupon_discount, coupon_error = _validate_coupon(coupon_code, user, total)
        if coupon_error:
            return None, Response({'success': False, 'message': coupon_error}, status=status.HTTP_400_BAD_REQUEST)

        payable = total + delivery - coupon_discount
        wallet = None
        wallet_used = Decimal('0')
        if use_wallet:
            wallet, _ = Wallet.objects.get_or_create(user=user)
            wallet_used = min(wallet.balance, payable)

        order = Order.objects.create(
            user=user,
            address=address,
            prescription=prescription,
            total_amount=payable - wallet_used,
            delivery_charge=delivery,
            discount=coupon_discount,
            coupon=coupon,
            wallet_used=wallet_used,
            payment_method=payment_method,
            payment_status=payment_status,
            status=order_status,
            notes=notes,
        )
        for item in items:
            OrderItem.objects.create(
                order=order,
                medicine=item.medicine,
                quantity=item.quantity,
                unit_price=item.medicine.price,
            )
            med = item.medicine
            med.stock_quantity = max(0, med.stock_quantity - item.quantity)
            if med.stock_quantity == 0:
                med.in_stock = False
            med.save(update_fields=['stock_quantity', 'in_stock'])

        if coupon:
            CouponUsage.objects.create(coupon=coupon, user=user, order=order, discount_amount=coupon_discount)

        if wallet_used > 0:
            wallet.balance -= wallet_used
            wallet.save(update_fields=['balance'])
            WalletTransaction.objects.create(
                wallet=wallet, type='DEBIT', amount=wallet_used,
                reason=f'Used on order #{str(order.id)[:8]}', balance_after=wallet.balance, order=order,
            )

        if clear_cart:
            cart.items.all().delete()

    _maybe_reward_referral(user)

    notify_user(
        user=user,
        type='ORDER',
        title='Order Placed',
        message=f'Your order #{str(order.id)[:8]} has been placed successfully.',
        link=f'/orders/{order.id}',
    )
    _notify_admins(
        'manage_orders', 'NEW_ORDER', 'New Order',
        f'{user.full_name} placed a new order #{str(order.id)[:8]} for NPR {order.total_amount}.',
        link='/admin/orders',
    )
    return order, None


def _prepare_awaiting_payment_order(user, order_id, coupon_code=None, use_wallet=False):
    """Looks up an AWAITING_PAYMENT order belonging to `user`, recomputes total_amount from only
    the OrderItems a pharmacy actually accepted (not the original full-cart total — some items may
    have gotten zero acceptances), and applies coupon/wallet against that reduced total.

    Safe to call more than once for the same order (e.g. the customer picks Khalti, it fails, they
    retry with COD): _release_order_holds() first undoes any wallet debit / coupon usage from a
    prior call on this order before reapplying fresh, so nothing double-charges the wallet.

    Returns (order, error_response) — exactly one is None.
    """
    try:
        order = Order.objects.prefetch_related('items__medicine').select_related('address').get(id=order_id, user=user)
    except Order.DoesNotExist:
        return None, Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

    if order.status != 'AWAITING_PAYMENT':
        return None, Response({'success': False, 'message': f'This order is not ready for payment (status: {order.status}).'}, status=status.HTTP_400_BAD_REQUEST)

    accepted_items = [i for i in order.items.all() if i.fulfillment_id is not None]
    if not accepted_items:
        return None, Response({'success': False, 'message': 'No pharmacy accepted any item in this order near your address. Please cancel this order and try again.'}, status=status.HTTP_400_BAD_REQUEST)

    _release_order_holds(order)

    subtotal = sum(i.unit_price * i.quantity for i in accepted_items)
    free_threshold = Decimal(_get_setting('free_delivery_threshold', '500'))
    delivery_charge_setting = Decimal(_get_setting('delivery_charge', '50'))
    delivery = Decimal('0') if (subtotal >= free_threshold or _has_active_plus(user)) else delivery_charge_setting

    coupon, coupon_discount, coupon_error = _validate_coupon(coupon_code, user, subtotal)
    if coupon_error:
        return None, Response({'success': False, 'message': coupon_error}, status=status.HTTP_400_BAD_REQUEST)

    payable = subtotal + delivery - coupon_discount
    wallet = None
    wallet_used = Decimal('0')
    if use_wallet:
        wallet, _ = Wallet.objects.get_or_create(user=user)
        wallet_used = min(wallet.balance, payable)

    order.total_amount = payable - wallet_used
    order.delivery_charge = delivery
    order.discount = coupon_discount
    order.coupon = coupon
    order.wallet_used = wallet_used
    order.save(update_fields=['total_amount', 'delivery_charge', 'discount', 'coupon', 'wallet_used'])

    if coupon:
        CouponUsage.objects.create(coupon=coupon, user=user, order=order, discount_amount=coupon_discount)
    if wallet_used > 0:
        wallet.balance -= wallet_used
        wallet.save(update_fields=['balance'])
        WalletTransaction.objects.create(
            wallet=wallet, type='DEBIT', amount=wallet_used,
            reason=f'Used on order #{str(order.id)[:8]}', balance_after=wallet.balance, order=order,
        )

    return order, None


class OrderCheckoutView(APIView):
    """Stage 3 entry point to the marketplace checkout flow. Creates the Order in BROADCASTING
    status with its OrderItems, kicks off broadcast_order(), and returns immediately — no payment
    prompt yet. The customer polls GET /orders/<id>/fulfillment-summary/ (which just reflects
    `order.status`) until it flips to AWAITING_PAYMENT, then calls one of the payment endpoints
    below with this order's id.

    Normally items come from the user's persisted Cart (source='CART'). If the request body
    includes an explicit `items` list instead — [{medicine_id, quantity}, ...] — that's a "Buy
    Now" purchase (source='DIRECT'): it bypasses the cart entirely, on purpose, so it doesn't
    disturb whatever else the customer already has sitting in their cart. sync_order_status()
    checks `order.source` before ever clearing the cart, specifically so a Buy Now purchase can
    never wipe out unrelated cart contents."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        address_id = request.data.get('address_id')
        if not address_id:
            return Response({'success': False, 'message': 'Delivery address is required.'}, status=status.HTTP_400_BAD_REQUEST)

        direct_items = request.data.get('items')
        source = 'DIRECT' if direct_items else 'CART'

        if source == 'DIRECT':
            if not isinstance(direct_items, list) or not direct_items:
                return Response({'success': False, 'message': "'items' must be a non-empty list."}, status=status.HTTP_400_BAD_REQUEST)
            resolved_items = []  # list of (medicine, quantity)
            for entry in direct_items:
                medicine_id = entry.get('medicine_id') if isinstance(entry, dict) else None
                try:
                    quantity = int(entry.get('quantity', 1))
                except (TypeError, ValueError):
                    quantity = 0
                if not medicine_id or quantity < 1:
                    return Response({'success': False, 'message': 'Each item needs a valid medicine_id and quantity.'}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    medicine = Medicine.objects.get(id=medicine_id)
                except Medicine.DoesNotExist:
                    return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
                resolved_items.append((medicine, quantity))
        else:
            try:
                cart = Cart.objects.prefetch_related('items__medicine').get(user=request.user)
            except Cart.DoesNotExist:
                return Response({'success': False, 'message': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)
            cart_items = cart.items.all()
            if not cart_items.exists():
                return Response({'success': False, 'message': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)
            resolved_items = [(item.medicine, item.quantity) for item in cart_items]

        try:
            address = Address.objects.get(id=address_id, user=request.user)
        except Address.DoesNotExist:
            return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, msg = check_address_serviceable(address)
        if not ok:
            return Response({'success': False, 'message': msg}, status=status.HTTP_400_BAD_REQUEST)

        prescription = None
        prescription_id = request.data.get('prescription_id')
        if prescription_id:
            try:
                prescription = Prescription.objects.get(id=prescription_id, user=request.user)
            except Prescription.DoesNotExist:
                pass

        # Per-medicine prescription assignment — {medicine_id: prescription_id}, lets a customer
        # attach a different prescription to each Rx medicine instead of one blanket prescription
        # for the whole order. Falls back to the single `prescription` above for any medicine not
        # explicitly covered here (keeps older single-prescription clients working unchanged).
        item_prescriptions_raw = request.data.get('item_prescriptions')
        item_prescriptions = {}
        if isinstance(item_prescriptions_raw, dict) and item_prescriptions_raw:
            candidate_ids = [v for v in item_prescriptions_raw.values() if v]
            owned_prescriptions = {
                str(p.id): p for p in Prescription.objects.filter(id__in=candidate_ids, user=request.user)
            }
            for medicine_id, presc_id in item_prescriptions_raw.items():
                matched = owned_prescriptions.get(str(presc_id))
                if matched:
                    item_prescriptions[str(medicine_id)] = matched

        with transaction.atomic():
            order = Order.objects.create(
                user=request.user,
                address=address,
                prescription=prescription or next(iter(item_prescriptions.values()), None),
                total_amount=Decimal('0'),  # recomputed from accepted items once payment is initiated
                status='BROADCASTING',
                payment_status='PENDING',
                source=source,
                notes=request.data.get('notes', ''),
            )
            for medicine, quantity in resolved_items:
                OrderItem.objects.create(
                    order=order, medicine=medicine,
                    quantity=quantity, unit_price=medicine.price,
                    prescription=item_prescriptions.get(str(medicine.id)) or prescription,
                )
            # Deliberately not decrementing Medicine.stock_quantity here — under the marketplace
            # model, stock lives on PharmacyMedicineListing and is only decremented once a
            # pharmacy actually wins an item, in pharmacy_accept_item().

        _maybe_reward_referral(request.user)
        # An Rx medicine's prescription doesn't have to be VERIFIED yet to search for a pharmacy —
        # broadcasting (and even a pharmacy accepting) proceeds immediately either way, so the
        # matching process isn't held up by a pending admin review. What it DOES gate is the
        # pharmacy actually starting to prepare it — see the Rx/prescription check in
        # pharmacy_advance_fulfillment() — which only matters once payment is confirmed anyway.
        # Deliberately no "Checking Nearby Pharmacies" notification here — the customer is already
        # looking at that exact status live on /checkout/broadcasting the instant this fires, so it
        # was pure noise. The next real notification (Order Ready for Payment / Order Placed) is
        # the first one that actually tells them something new.
        broadcast_result = broadcast_order(order)
        order.refresh_from_db()

        return Response({
            'success': True,
            'data': {
                'order': OrderSerializer(order).data,
                'broadcast': {
                    'broadcast': [str(i) for i in broadcast_result['broadcast']],
                    'unfulfillable': [str(i) for i in broadcast_result['unfulfillable']],
                },
            },
        }, status=status.HTTP_201_CREATED)


class OrderFulfillmentSummaryView(APIView):
    """Shows the customer exactly what got accepted (ready to pay for) vs what got zero
    acceptance vs what's still pending, before they commit to paying."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        # Polled every few seconds by the checkout/broadcasting screen while an order is still
        # resolving — same infrastructure-free trigger point as PharmacyRequestListView (see
        # widen_stale_priority_broadcasts()'s docstring: no real scheduler exists in this
        # project). Called before the order lookup below so a widen affecting THIS order is
        # reflected in the very same response, not just the next poll.
        widen_stale_priority_broadcasts()
        try:
            order = Order.objects.prefetch_related('items__medicine', 'items__fulfillment_requests').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        accepted, unfulfilled, pending = [], [], []
        for item in order.items.all():
            entry = {
                'order_item_id': str(item.id),
                'medicine_id': str(item.medicine_id),
                'medicine_name': item.medicine.name,
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
            }
            if item.fulfillment_id is not None:
                accepted.append(entry)
            elif any(r.status == 'PENDING' for r in item.fulfillment_requests.all()):
                pending.append(entry)
            else:
                unfulfilled.append(entry)

        return Response({
            'success': True,
            'data': {
                'order_status': order.status,
                'accepted_items': accepted,
                'unfulfilled_items': unfulfilled,
                'pending_items': pending,
                'all_resolved': len(pending) == 0,
            },
        })


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # NO_PHARMACY_FOUND orders are a dead end (nothing was ever accepted, nothing to pay for
        # or track) — excluded from the customer's own history; still fully visible to admin for
        # tracking which pharmacies declined/ignored requests. See sync_order_status().
        orders = Order.objects.filter(user=request.user).exclude(status='NO_PHARMACY_FOUND').select_related('user').prefetch_related('items__medicine', 'items__prescription').order_by('-placed_at')
        return Response({'success': True, 'data': {'orders': OrderSerializer(orders, many=True).data}})

    def post(self, request):
        """Stage 3: no longer creates an order from scratch — that's OrderCheckoutView's job now.
        This only finalizes an existing AWAITING_PAYMENT order as Cash on Delivery (the only
        method it can confirm without a gateway round-trip); use the dedicated payment endpoints
        for eSewa/Khalti."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'success': False, 'message': 'order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        payment_method = request.data.get('payment_method') or request.data.get('paymentMethod', 'CASH_ON_DELIVERY')
        if payment_method != 'CASH_ON_DELIVERY':
            return Response({'success': False, 'message': 'Use /payment/esewa/initiate/ or /payment/khalti/initiate/ for gateway payments.'}, status=status.HTTP_400_BAD_REQUEST)

        order, err = _prepare_awaiting_payment_order(
            request.user, order_id,
            coupon_code=request.data.get('coupon_code'), use_wallet=bool(request.data.get('use_wallet')),
        )
        if err:
            return err
        order.payment_method = payment_method
        order.save(update_fields=['payment_method'])
        sync_order_status(order)
        if order.status == 'PLACED':
            _notify_admins('manage_orders', 'NEW_ORDER', 'New Order',
                            f'{request.user.full_name} placed order #{str(order.id)[:8]} for NPR {order.total_amount}.', link='/admin/orders')
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}}, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            # .exclude(status='NO_PHARMACY_FOUND') — see OrderListView: these are a dead end and
            # deliberately hidden from the customer entirely, not just the list.
            order = Order.objects.exclude(status='NO_PHARMACY_FOUND').prefetch_related(
                'items__medicine', 'items__prescription', 'fulfillments__pharmacy', 'fulfillments__delivery_agent__user',
                'fulfillments__order_items__medicine', 'fulfillments__order_items__prescription',
            ).select_related('user', 'address', 'prescription').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = OrderSerializer(order).data
        # Order.status alone barely moves once payment is confirmed — it sits at PLACED for the
        # entire journey from "pharmacy packing it" through "delivered". The per-pharmacy-leg
        # detail is what actually shows the customer what's happening, same reasoning as the admin
        # Order detail view (AdminOrderFulfillmentSerializer has no admin-only fields, safe to
        # reuse here — pharmacy name, status, items, rider name, timestamps only).
        data['fulfillments'] = AdminOrderFulfillmentSerializer(order.fulfillments.all(), many=True).data
        return Response({'success': True, 'data': {'order': data}})

    def delete(self, request, pk):
        # Customer self-service equivalent of AdminOrderDetailView.delete() — same CANCELLED-only
        # restriction and same reasoning (a cancelled order never reached DELIVERED, so it never
        # has the PROTECTed financial records a delivered one would).
        try:
            order = Order.objects.get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status != 'CANCELLED':
            return Response({'success': False, 'message': 'Only cancelled orders can be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order.delete()
        except ProtectedError:
            return Response({'success': False, 'message': 'This order has related records and cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Order deleted.'})


class OrderTrackingView(APIView):
    """Live(ish) rider tracking for the customer's own order — one entry per fulfillment, since a
    split order across multiple pharmacies has a rider (or none yet) per leg, not one for the
    whole order. See matching._tracking_payload() for the per-fulfillment shape."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            order = Order.objects.get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        fulfillments = order.fulfillments.select_related('pharmacy', 'delivery_agent__user', 'order__address').prefetch_related('order_items__medicine', 'order_items__prescription')
        return Response({'success': True, 'data': {'fulfillments': [_tracking_payload(f) for f in fulfillments]}})


class OrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    # AWAITING_PRESCRIPTION/PRESCRIPTION_REJECTED: held before ever reaching pharmacies — a
    # customer waiting on verification, or asked to re-upload, can still back out entirely.
    # BROADCASTING/AWAITING_PAYMENT: still in the marketplace matching stage, before any payment —
    # this is "stop looking," used by the checkout/broadcasting page's cancel-after-2-minutes option.
    # PLACED/CONFIRMED: already paid/confirmed — the pre-existing customer-initiated cancel path.
    CANCELLABLE_STATUSES = ('AWAITING_PRESCRIPTION', 'PRESCRIPTION_REJECTED', 'BROADCASTING', 'AWAITING_PAYMENT', 'PLACED', 'CONFIRMED')

    def put(self, request, pk):
        try:
            order = Order.objects.prefetch_related('items__medicine').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status not in self.CANCELLABLE_STATUSES:
            return Response({'success': False, 'message': 'Order cannot be cancelled at this stage.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Note: no Medicine.stock_quantity adjustment here — under the marketplace model,
            # checkout never decrements it in the first place, so there's nothing to give back on
            # that model. PharmacyMedicineListing.stock_quantity IS decremented once a pharmacy
            # wins an item (pharmacy_accept_item()), and IS restored below for any fulfillment
            # that had actually reached that point before the cancel.
            if order.status in ('BROADCASTING', 'AWAITING_PAYMENT'):
                # stop pharmacies from being able to accept an order the customer just cancelled
                FulfillmentRequest.objects.filter(
                    order_item__order=order, status='PENDING',
                ).update(status='EXPIRED', responded_at=timezone.now())

            # Any pharmacy (or rider) already committed to this order — accepted, mid-prep, even
            # already out for delivery — was left with zero signal that the customer cancelled:
            # their dashboard card just sat there forever as if it were still active. Cancel every
            # fulfillment that hasn't already reached a terminal state and tell whoever owns it.
            active_fulfillments = list(
                order.fulfillments.exclude(status__in=('DELIVERED', 'CANCELLED')).select_related('pharmacy__user', 'delivery_agent__user')
            )
            for fulfillment in active_fulfillments:
                if fulfillment.pharmacy_id:
                    # Give back what pharmacy_accept_item() took — same F() pattern as the
                    # decrement there, so a concurrent accept/cancel on the same listing can't
                    # race and leave stock_quantity wrong.
                    for item in order.items.all():
                        if item.fulfillment_id == fulfillment.id:
                            PharmacyMedicineListing.objects.filter(
                                pharmacy_id=fulfillment.pharmacy_id, medicine_id=item.medicine_id,
                            ).update(stock_quantity=F('stock_quantity') + item.quantity)
                    notify_user(
                        user=fulfillment.pharmacy.user, type='ORDER_CANCELLED', title='Order Cancelled',
                        message=f'The customer cancelled order #{str(order.id)[:8]} — no need to prepare it further.',
                        link='/pharmacy/orders',
                    )
                if fulfillment.delivery_agent_id:
                    notify_user(
                        user=fulfillment.delivery_agent.user, type='ORDER_CANCELLED', title='Order Cancelled',
                        message=f'The customer cancelled order #{str(order.id)[:8]} — do not deliver it.',
                        link='/delivery/active',
                    )
            OrderFulfillment.objects.filter(id__in=[f.id for f in active_fulfillments]).update(status='CANCELLED')

            order.status = 'CANCELLED'
            if order.payment_status == 'PENDING':
                order.payment_status = 'FAILED'
            order.save(update_fields=['status', 'payment_status'])
            _release_order_holds(order)

        # No customer-facing Notification here — this view only ever cancels the requesting
        # user's own order (see the .get(..., user=request.user) above), so the customer is
        # always the one who just clicked "Cancel" themselves and already got an immediate
        # toast confirmation. A persisted notification for an action they just took is the same
        # kind of redundant noise as the old "Checking Nearby Pharmacies" notification was.
        _notify_admins('manage_orders', 'ORDER_CANCELLED', 'Order Cancelled',
                        f'{request.user.full_name} cancelled order #{str(order.id)[:8]}.', link='/admin/orders')
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}, 'message': 'Order cancelled.'})


class OrderAttachPrescriptionView(APIView):
    """Lets the customer re-attach a prescription to one of an order's Rx items — e.g. after
    admin rejects one, so they can upload a replacement without restarting checkout. Searching for
    a pharmacy already happened at checkout regardless of prescription status, so this never
    touches Order.status; it just updates which prescription an item points to. Body:
    {item_prescriptions: {medicine_id: prescription_id}}, same shape the checkout endpoint
    accepts."""
    permission_classes = [IsAuthenticated]
    TERMINAL_STATUSES = ('CANCELLED', 'DELIVERED', 'RETURNED', 'NO_PHARMACY_FOUND')

    def post(self, request, pk):
        try:
            order = Order.objects.prefetch_related('items__medicine', 'items__prescription').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status in self.TERMINAL_STATUSES:
            return Response({'success': False, 'message': 'This order can no longer accept a new prescription.'}, status=status.HTTP_400_BAD_REQUEST)

        item_prescriptions_raw = request.data.get('item_prescriptions')
        if not isinstance(item_prescriptions_raw, dict) or not item_prescriptions_raw:
            return Response({'success': False, 'message': "'item_prescriptions' is required."}, status=status.HTTP_400_BAD_REQUEST)

        candidate_ids = [v for v in item_prescriptions_raw.values() if v]
        owned_prescriptions = {str(p.id): p for p in Prescription.objects.filter(id__in=candidate_ids, user=request.user)}

        updated = 0
        for item in order.items.all():
            matched = owned_prescriptions.get(str(item_prescriptions_raw.get(str(item.medicine_id))))
            if matched:
                item.prescription = matched
                item.save(update_fields=['prescription'])
                updated += 1
        if updated == 0:
            return Response({'success': False, 'message': 'None of the submitted prescriptions could be attached.'}, status=status.HTTP_400_BAD_REQUEST)

        if not order.prescription_id:
            order.prescription = next(iter(owned_prescriptions.values()), None)
            order.save(update_fields=['prescription'])

        order.refresh_from_db()
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}})


class OrderRateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        rating = _parse_rating(request.data.get('order_rating'))
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=pk, user=request.user, status='DELIVERED')
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Delivered order not found.'}, status=status.HTTP_404_NOT_FOUND)

        order.order_rating = rating
        order.order_comment = request.data.get('order_comment') or None
        order.save(update_fields=['order_rating', 'order_comment'])
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}, 'message': 'Order rated.'})


class FulfillmentRateRiderView(APIView):
    """Rates the specific rider who handled one leg of the customer's own order — separate from
    OrderRateView above (which rates the overall order, not any one person). Restricted to
    DELIVERED legs that actually had a rider assigned; `order__user=request.user` is the ownership
    boundary, same pattern as every other customer-scoped order endpoint."""
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        rating = _parse_rating(request.data.get('rider_rating'))
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fulfillment = OrderFulfillment.objects.get(
                id=pk, order__user=request.user, status='DELIVERED', delivery_agent__isnull=False,
            )
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivered fulfillment with a rider not found.'}, status=status.HTTP_404_NOT_FOUND)

        fulfillment.rider_rating = rating
        fulfillment.rider_rating_comment = request.data.get('rider_rating_comment') or None
        fulfillment.save(update_fields=['rider_rating', 'rider_rating_comment'])
        return Response({
            'success': True,
            'data': {'fulfillment': AdminOrderFulfillmentSerializer(fulfillment).data},
            'message': 'Rider rated.',
        })


# ─── Payment ──────────────────────────────────────────────────────────────────

def _esewa_signature(total_amount, transaction_uuid):
    msg = f'total_amount={total_amount},transaction_uuid={transaction_uuid},product_code={ESEWA_PRODUCT_CODE}'
    return base64.b64encode(hmac.new(ESEWA_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).digest()).decode()


class PaymentCodPlaceView(APIView):
    """Stage 3: takes an existing AWAITING_PAYMENT order (created by OrderCheckoutView) rather
    than creating one from the cart. Guarded to only proceed when the order is AWAITING_PAYMENT,
    and charges only for the items a pharmacy actually accepted."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'success': False, 'message': 'order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _prepare_awaiting_payment_order(
            request.user, order_id,
            coupon_code=request.data.get('coupon_code'), use_wallet=bool(request.data.get('use_wallet')),
        )
        if err:
            return err
        order.payment_method = 'CASH_ON_DELIVERY'
        order.save(update_fields=['payment_method'])
        sync_order_status(order)  # payment_method == 'CASH_ON_DELIVERY' is itself the confirmation -> PLACED
        if order.status == 'PLACED':
            _notify_admins('manage_orders', 'NEW_ORDER', 'New Order',
                            f'{request.user.full_name} placed order #{str(order.id)[:8]} for NPR {order.total_amount}.', link='/admin/orders')
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}}, status=status.HTTP_201_CREATED)


class PaymentEsewaInitiateView(APIView):
    """Stage 3: takes an existing AWAITING_PAYMENT order rather than creating one from the cart.
    order.status stays AWAITING_PAYMENT here — it only moves to PLACED once eSewa's success
    callback confirms payment, via _finalize_paid_order()."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'success': False, 'message': 'order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _prepare_awaiting_payment_order(
            request.user, order_id,
            coupon_code=request.data.get('coupon_code'), use_wallet=bool(request.data.get('use_wallet')),
        )
        if err:
            return err

        order.payment_method = 'ESEWA'
        transaction_uuid = f'{order.id}-{int(timezone.now().timestamp())}'
        order.esewa_transaction_uuid = transaction_uuid
        order.save(update_fields=['payment_method', 'esewa_transaction_uuid'])

        total_str = str(order.total_amount)
        signature = _esewa_signature(total_str, transaction_uuid)

        return Response({
            'success': True,
            'data': {
                'formUrl': ESEWA_FORM_URL,
                'params': {
                    'amount': total_str,
                    'tax_amount': '0',
                    'total_amount': total_str,
                    'transaction_uuid': transaction_uuid,
                    'product_code': ESEWA_PRODUCT_CODE,
                    'product_service_charge': '0',
                    'product_delivery_charge': '0',
                    'success_url': f'{BACKEND_URL}/api/payment/esewa/success/',
                    'failure_url': f'{BACKEND_URL}/api/payment/esewa/failure/',
                    'signed_field_names': 'total_amount,transaction_uuid,product_code',
                    'signature': signature,
                },
            },
        })


def _finalize_paid_order(order):
    """Stage 3: no longer jumps status straight to CONFIRMED. Setting payment_status='PAID' and
    routing through sync_order_status() takes AWAITING_PAYMENT -> PLACED (the pharmacy already
    confirmed/accepted before payment was even offered, so PLACED — not CONFIRMED — is the correct
    landing status now; sync_order_status() also clears the cart and fires the "Order Placed"
    customer notification as part of that transition)."""
    order.payment_status = 'PAID'
    order.save(update_fields=['payment_status'])
    sync_order_status(order)

    notify_user(
        user=order.user, type='PAYMENT_UPDATE', title='Payment Received',
        message=f'Payment for order #{str(order.id)[:8]} was received successfully.',
        link=f'/orders/{order.id}',
    )
    _notify_admins(
        'manage_orders', 'PAYMENT_UPDATE', 'Payment Received',
        f'Payment received for order #{str(order.id)[:8]} from {order.user.full_name} (NPR {order.total_amount}).',
        link='/admin/orders',
    )
    if order.status == 'PLACED':
        _notify_admins('manage_orders', 'NEW_ORDER', 'New Order',
                        f'{order.user.full_name} placed order #{str(order.id)[:8]} for NPR {order.total_amount}.', link='/admin/orders')


def _cancel_unpaid_order(order):
    if order.payment_status == 'PENDING':
        order.payment_status = 'FAILED'
        order.status = 'CANCELLED'
        order.save(update_fields=['payment_status', 'status'])
        _release_order_holds(order)


class EsewaSuccessView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if not data:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=missing_data')
        try:
            decoded = json.loads(base64.b64decode(data).decode('utf-8'))
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=bad_data')

        if decoded.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=incomplete')

        try:
            resp = requests.get(ESEWA_VERIFY_URL, params={
                'product_code': ESEWA_PRODUCT_CODE,
                'total_amount': decoded.get('total_amount'),
                'transaction_uuid': decoded.get('transaction_uuid'),
            }, timeout=10)
            verification = resp.json()
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=verify_error')

        if verification.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=not_verified')

        try:
            order = Order.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
        except Order.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=order_not_found')

        if order.payment_status != 'PAID':
            _finalize_paid_order(order)
        return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/confirmation?orderId={order.id}')


class EsewaFailureView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if data:
            try:
                decoded = json.loads(base64.b64decode(data).decode('utf-8'))
                order = Order.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
                _cancel_unpaid_order(order)
            except Exception:
                pass
        return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=esewa_cancelled')


def _khalti_post(path, body):
    resp = requests.post(f'{KHALTI_API_URL}{path}', json=body, headers={
        'Authorization': f'key {KHALTI_SECRET_KEY}',
        'Content-Type': 'application/json',
    }, timeout=15)
    return resp.json()


class PaymentKhaltiInitiateView(APIView):
    """Stage 3: takes an existing AWAITING_PAYMENT order rather than creating one from the cart.
    Unlike the old flow, a failed initiate attempt no longer deletes the order (there's nothing
    to delete-and-retry-from-cart anymore) — holds are just released via _release_order_holds()
    so the order sits back in AWAITING_PAYMENT and the customer can retry or pick another method."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'success': False, 'message': 'order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _prepare_awaiting_payment_order(
            request.user, order_id,
            coupon_code=request.data.get('coupon_code'), use_wallet=bool(request.data.get('use_wallet')),
        )
        if err:
            return err

        amount_paisa = int(round(float(order.total_amount) * 100))
        if amount_paisa < 1000:
            _release_order_holds(order)
            return Response({'success': False, 'message': 'Khalti requires a minimum payable amount of NPR 10. Please choose another payment method.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            khalti_res = _khalti_post('/epayment/initiate/', {
                'return_url': f'{BACKEND_URL}/api/payment/khalti/verify/',
                'website_url': FRONTEND_URL,
                'amount': amount_paisa,
                'purchase_order_id': str(order.id),
                'purchase_order_name': f'Swasthaya Order #{str(order.id)[-8:].upper()}',
                'customer_info': {
                    'name': request.user.full_name,
                    'email': request.user.email,
                    'phone': request.user.phone or '9800000000',
                },
            })
        except Exception:
            _release_order_holds(order)
            return Response({'success': False, 'message': 'Failed to reach Khalti.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not khalti_res.get('pidx'):
            _release_order_holds(order)
            return Response({'success': False, 'message': khalti_res.get('detail') or khalti_res.get('message') or 'Khalti initiation failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        order.payment_method = 'KHALTI'
        order.khalti_pidx = khalti_res['pidx']
        order.save(update_fields=['payment_method', 'khalti_pidx'])
        return Response({'success': True, 'data': {'payment_url': khalti_res['payment_url']}})


class KhaltiVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        pidx = request.query_params.get('pidx')
        gateway_status = request.query_params.get('status')

        if not pidx or gateway_status != 'Completed':
            if pidx:
                try:
                    _cancel_unpaid_order(Order.objects.get(khalti_pidx=pidx))
                except Order.DoesNotExist:
                    pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=khalti_cancelled')

        try:
            verification = _khalti_post('/epayment/lookup/', {'pidx': pidx})
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=verify_error')

        if verification.get('status') != 'Completed':
            try:
                _cancel_unpaid_order(Order.objects.get(khalti_pidx=pidx))
            except Order.DoesNotExist:
                pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=not_verified')

        try:
            order = Order.objects.get(khalti_pidx=pidx)
        except Order.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/payment-failed?reason=order_not_found')

        if order.payment_status != 'PAID':
            _finalize_paid_order(order)
        return HttpResponseRedirect(f'{FRONTEND_URL}/checkout/confirmation?orderId={order.id}')


# ─── Doctor Consult: Appointment Payment ───────────────────────────────────────
#
# Mirrors PaymentKhaltiInitiateView/KhaltiVerifyView's structure exactly, scoped to
# DoctorAppointment instead of Order. _khalti_post() is already a generic, order-agnostic HTTP
# helper (just a signed POST to Khalti's API) so it's reused directly rather than duplicated.
# Everything order-specific in the original flow — _prepare_awaiting_payment_order() (cart/coupon/
# wallet resolution), _release_order_holds() (stock holds), sync_order_status() (fulfillment/
# delivery state machine) — has no equivalent here: a consultation has no cart, no delivery
# charge, and no inventory to hold, so a fresh CONFIRMED/PENDING appointment.status transition
# does the whole job instead.

class AppointmentKhaltiInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        appointment_id = request.data.get('appointment_id')
        if not appointment_id:
            return Response({'success': False, 'message': 'appointment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            appt = DoctorAppointment.objects.select_related('doctor').get(id=appointment_id, user=request.user)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appt.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This appointment does not need payment (status: {appt.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        amount_paisa = int(round(float(appt.fee_charged) * 100))
        if amount_paisa < 1000:
            return Response({'success': False, 'message': 'Khalti requires a minimum payable amount of NPR 10. Please choose another payment method.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            khalti_res = _khalti_post('/epayment/initiate/', {
                'return_url': f'{BACKEND_URL}/api/payment/khalti/verify-appointment/',
                'website_url': FRONTEND_URL,
                'amount': amount_paisa,
                'purchase_order_id': str(appt.id),
                'purchase_order_name': f'Swasthaya Consultation with Dr. {appt.doctor.name}',
                'customer_info': {
                    'name': request.user.full_name,
                    'email': request.user.email,
                    'phone': request.user.phone or '9800000000',
                },
            })
        except Exception:
            return Response({'success': False, 'message': 'Failed to reach Khalti.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not khalti_res.get('pidx'):
            return Response({'success': False, 'message': khalti_res.get('detail') or khalti_res.get('message') or 'Khalti initiation failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        appt.payment_method = 'KHALTI'
        appt.khalti_pidx = khalti_res['pidx']
        appt.save(update_fields=['payment_method', 'khalti_pidx'])
        return Response({'success': True, 'data': {'payment_url': khalti_res['payment_url']}})


def _confirm_appointment(appt):
    """The one idempotent place a doctor appointment moves PENDING -> CONFIRMED and both parties are
    notified — mirrors _confirm_lab_test_booking(). Called at booking creation for a Plus-free
    consultation (payment not required), or from the Khalti verify view once payment settles. The
    `status != 'PENDING'` guard makes it fire exactly once. Nothing notifies at booking creation for
    a paid consultation, so the admin is never emailed about an appointment whose payment may never
    complete."""
    if appt.status != 'PENDING':
        return
    appt.status = 'CONFIRMED'
    appt.save(update_fields=['status'])
    _ensure_meeting_link(appt)

    date_label = appt.scheduled_date.strftime('%b %d, %Y')
    plus_free = appt.payment_status == 'NOT_REQUIRED'
    customer_payment_line = (
        'This consultation is included with your Swasthaya Plus membership — no charge.'
        if plus_free else f'Payment received. Fee: NPR {appt.fee_charged}.'
    )
    notify_user(
        appt.user, 'APPOINTMENT_UPDATE', 'Appointment Confirmed',
        f'Your appointment with Dr. {appt.doctor.name} is confirmed for {date_label}, '
        f'{appt.time_slot}. {customer_payment_line}',
        link='/appointments',
    )
    _notify_admins(
        'manage_doctors', 'NEW_APPOINTMENT', 'New Doctor Appointment',
        f'{appt.user.full_name} booked an appointment with Dr. {appt.doctor.name} for {date_label} '
        f'({appt.time_slot}). {"Plus-free consultation" if plus_free else f"Paid online — NPR {appt.fee_charged}"}.',
        link='/admin/doctor-consult',
    )
    # The doctor is the one person who has to show up, and until now was the only party not told.
    # Guarded on user_id because the legacy Doctor rows predate logins entirely (see
    # AdminDoctorLinkAccountView) — those have nobody to notify. The fee is deliberately left out:
    # what the patient paid is not the doctor's share, that's DoctorPayout's job.
    if appt.doctor.user_id:
        notify_user(
            appt.doctor.user, 'APPOINTMENT_UPDATE', 'New Appointment Booked',
            f'{appt.user.full_name} booked a consultation with you for {date_label}, {appt.time_slot}.'
            + (f' Reason: {appt.reason}' if appt.reason else ''),
            link='/doctor/appointments',
        )


def _cancel_unpaid_appointment(appt):
    # payment_status has no FAILED state (Stage 1: PENDING/PAID/NOT_REQUIRED only) — cancelling the
    # appointment itself is what frees the slot back up via get_available_slots(); payment_status
    # stays PENDING since a payment simply never completed, there's nothing further to record.
    if appt.payment_status == 'PENDING' and appt.status == 'PENDING':
        appt.status = 'CANCELLED'
        appt.save(update_fields=['status'])


class AppointmentKhaltiVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        pidx = request.query_params.get('pidx')
        gateway_status = request.query_params.get('status')

        if not pidx or gateway_status != 'Completed':
            if pidx:
                try:
                    _cancel_unpaid_appointment(DoctorAppointment.objects.get(khalti_pidx=pidx))
                except DoctorAppointment.DoesNotExist:
                    pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=khalti_cancelled')

        try:
            verification = _khalti_post('/epayment/lookup/', {'pidx': pidx})
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=verify_error')

        if verification.get('status') != 'Completed':
            try:
                _cancel_unpaid_appointment(DoctorAppointment.objects.get(khalti_pidx=pidx))
            except DoctorAppointment.DoesNotExist:
                pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=not_verified')

        try:
            appt = DoctorAppointment.objects.get(khalti_pidx=pidx)
        except DoctorAppointment.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=appointment_not_found')

        if appt.payment_status != 'PAID':
            appt.payment_status = 'PAID'
            appt.save(update_fields=['payment_status'])
            _confirm_appointment(appt)
        return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-confirmation?appointmentId={appt.id}')


# eSewa for consultations. Structurally identical to PaymentEsewaInitiateLabTestView /
# LabTestEsewaSuccessView / LabTestEsewaFailureView, scoped to DoctorAppointment: the appointment is
# already created and PENDING by the time we get here (AppointmentListCreateView made it), so this
# only settles money and hands off to the same _confirm_appointment() the Khalti path uses.
class AppointmentEsewaInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        appointment_id = request.data.get('appointment_id')
        if not appointment_id:
            return Response({'success': False, 'message': 'appointment_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            appt = DoctorAppointment.objects.get(id=appointment_id, user=request.user)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appt.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This appointment does not need payment (status: {appt.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        appt.payment_method = 'ESEWA'
        transaction_uuid = f'{appt.id}-{int(timezone.now().timestamp())}'
        appt.esewa_transaction_uuid = transaction_uuid
        appt.save(update_fields=['payment_method', 'esewa_transaction_uuid'])

        total_str = str(appt.fee_charged)
        signature = _esewa_signature(total_str, transaction_uuid)

        return Response({
            'success': True,
            'data': {
                'formUrl': ESEWA_FORM_URL,
                'params': {
                    'amount': total_str,
                    'tax_amount': '0',
                    'total_amount': total_str,
                    'transaction_uuid': transaction_uuid,
                    'product_code': ESEWA_PRODUCT_CODE,
                    'product_service_charge': '0',
                    'product_delivery_charge': '0',
                    'success_url': f'{BACKEND_URL}/api/payment/esewa/success-appointment/',
                    'failure_url': f'{BACKEND_URL}/api/payment/esewa/failure-appointment/',
                    'signed_field_names': 'total_amount,transaction_uuid,product_code',
                    'signature': signature,
                },
            },
        })


class AppointmentEsewaSuccessView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if not data:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=missing_data')
        try:
            decoded = json.loads(base64.b64decode(data).decode('utf-8'))
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=bad_data')

        if decoded.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=incomplete')

        try:
            resp = requests.get(ESEWA_VERIFY_URL, params={
                'product_code': ESEWA_PRODUCT_CODE,
                'total_amount': decoded.get('total_amount'),
                'transaction_uuid': decoded.get('transaction_uuid'),
            }, timeout=10)
            verification = resp.json()
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=verify_error')

        if verification.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=not_verified')

        try:
            appt = DoctorAppointment.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
        except DoctorAppointment.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=appointment_not_found')

        if appt.payment_status != 'PAID':
            appt.payment_status = 'PAID'
            appt.save(update_fields=['payment_status'])
            _confirm_appointment(appt)
        return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-confirmation?appointmentId={appt.id}')


class AppointmentEsewaFailureView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if data:
            try:
                decoded = json.loads(base64.b64decode(data).decode('utf-8'))
                appt = DoctorAppointment.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
                _cancel_unpaid_appointment(appt)
            except Exception:
                pass
        return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-failed?reason=esewa_cancelled')


# ─── Lab Tests ────────────────────────────────────────────────────────────────

class LabTestCategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = LabTestCategory.objects.filter(is_active=True).order_by('name')
        return Response({'success': True, 'data': {'categories': LabTestCategorySerializer(categories, many=True).data}})


class LabTestListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = LabTest.objects.select_related('category').filter(is_active=True)

        search = request.query_params.get('search', '').strip()
        category = request.query_params.get('category', '').strip()
        is_package = request.query_params.get('isPackage', '').strip()
        sort = request.query_params.get('sortBy', 'popular')

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(parameters_included__icontains=search))
        if category:
            names = [c.strip() for c in category.split(',') if c.strip()]
            if names:
                qs = qs.filter(category__name__in=names)
        if is_package == 'true':
            qs = qs.filter(is_package=True)
        elif is_package == 'false':
            qs = qs.filter(is_package=False)

        sort_map = {
            'popular': '-total_bookings',
            'price-asc': 'price',
            'price-desc': '-price',
            'name': 'name',
        }
        qs = qs.order_by(sort_map.get(sort, '-total_bookings'))

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(100, max(1, int(request.query_params.get('limit', 20))))
        except ValueError:
            page, limit = 1, 20

        total = qs.count()
        start = (page - 1) * limit
        tests = qs[start:start + limit]

        return Response({
            'success': True,
            'data': {
                'labTests': LabTestListSerializer(tests, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class LabTestDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            test = LabTest.objects.select_related('category').prefetch_related('included_tests__category').get(id=pk, is_active=True)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'labTest': LabTestDetailSerializer(test).data}})


TIME_SLOTS = ['6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '4:00 PM - 6:00 PM', '6:00 PM - 8:00 PM']


def _clean_patient_fields(data):
    """Normalize the inline "who is this collection for" fields off a request body or a single cart
    item into LabTestBooking kwargs. All-empty -> all None -> the booking is for the account holder
    (the default, and every pre-existing booking). Lenient by design: a bad age or unknown gender is
    dropped to None rather than failing the booking, since these are convenience fields on top of an
    account that already identifies the payer. Writes are handled here (not via the serializer) so
    both create paths — single and per-cart-line — share one definition."""
    if not isinstance(data, dict):
        data = {}
    name = (data.get('patient_name') or '').strip()
    phone = (data.get('patient_phone') or '').strip()
    gender = (data.get('patient_gender') or '').strip().upper()
    age_raw = data.get('patient_age')
    try:
        age = int(age_raw) if age_raw not in (None, '') else None
    except (ValueError, TypeError):
        age = None
    if age is not None and not (0 < age < 150):
        age = None
    return {
        'patient_name': name[:255] or None,
        'patient_phone': phone[:20] or None,
        'patient_age': age,
        'patient_gender': gender if gender in ('MALE', 'FEMALE', 'OTHER') else None,
    }


class LabTestBookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bookings = (
            LabTestBooking.objects.filter(user=request.user)
            .select_related('lab_test__category', 'address', 'collector__user')
            # Feeds ordered_by_doctor / shared_with on the serializer without going N+1 per booking.
            .prefetch_related('prescription_items__prescription__appointment__doctor', 'report_shares__doctor')
            .order_by('-booked_at')
        )
        return Response({'success': True, 'data': {'bookings': LabTestBookingSerializer(bookings, many=True).data}})

    def post(self, request):
        s = LabTestBookingSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        if request.data.get('time_slot') not in TIME_SLOTS:
            return Response({'success': False, 'message': 'Invalid time slot.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lab_test = LabTest.objects.get(id=s.validated_data['lab_test_id'], is_active=True)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            address = Address.objects.get(id=s.validated_data['address_id'], user=request.user)
        except Address.DoesNotExist:
            return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, msg = check_address_serviceable(address)
        if not ok:
            return Response({'success': False, 'message': msg}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method')
        if payment_method not in ('KHALTI', 'ESEWA', 'CASH_ON_DELIVERY'):
            return Response({'success': False, 'message': "payment_method must be one of: KHALTI, ESEWA, CASH_ON_DELIVERY."}, status=status.HTTP_400_BAD_REQUEST)

        # Booking creation is never blocked by the payment path — mirrors how order checkout
        # already separates "order exists" from "order paid". CASH_ON_DELIVERY has no gateway
        # callback to wait for, so it's confirmed (and, from Stage 3 onward, broadcast to
        # collectors) immediately, same as PaymentCodPlaceView does for orders. KHALTI/ESEWA stay
        # PENDING until their respective initiate+verify round trip actually confirms payment.
        booking = LabTestBooking.objects.create(
            user=request.user,
            lab_test=lab_test,
            address=address,
            scheduled_date=s.validated_data['scheduled_date'],
            time_slot=s.validated_data['time_slot'],
            total_amount=lab_test.price,
            notes=s.validated_data.get('notes'),
            payment_method=payment_method,
            **_clean_patient_fields(request.data),
        )
        if payment_method == 'CASH_ON_DELIVERY':
            _confirm_lab_test_booking(booking)

        lab_test.total_bookings = F('total_bookings') + 1
        lab_test.save(update_fields=['total_bookings'])
        # F() leaves lab_test.total_bookings holding an unresolved expression in memory —
        # serializing it as-is below (via booking.lab_test) would crash. Refresh it, and repoint
        # booking.lab_test at this same refreshed instance so the response doesn't serialize
        # whichever object DRF's related-object caching happened to hand back — same fix as
        # DoctorAppointmentCompleteView's doctor.total_consultations.
        lab_test.refresh_from_db(fields=['total_bookings'])
        booking.lab_test = lab_test

        # Optional: link this booking back to the doctor-suggested item it fulfills, so both the
        # patient and the doctor can see which suggestions were actually followed through on.
        # Silently ignored if it doesn't resolve to a matching, not-yet-booked suggestion of this
        # patient's own — this is a courtesy link, not something worth failing the booking over.
        prescription_item_id = request.data.get('prescription_lab_test_item_id')
        if prescription_item_id:
            PrescriptionLabTestItem.objects.filter(
                id=prescription_item_id, prescription__user=request.user, lab_test=lab_test, booking__isnull=True,
            ).update(booking=booking)

        # No notification here: admins (and the customer) are notified only from
        # _confirm_lab_test_booking(), i.e. once the booking actually reaches CONFIRMED — at
        # creation for COD, or after gateway verify for Khalti/eSewa. This is what stops the admin
        # being emailed about a booking whose online payment may never complete.
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Lab test booked!'}, status=status.HTTP_201_CREATED)


class LabTestBookingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            booking = (
                LabTestBooking.objects
                .select_related('lab_test__category', 'address', 'collector__user')
                .prefetch_related('prescription_items__prescription__appointment__doctor', 'report_shares__doctor')
                .get(id=pk, user=request.user)
            )
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}})

    def put(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(id=pk, user=request.user)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get('status') != 'CANCELLED':
            return Response({'success': False, 'message': 'You can only cancel a booking.'}, status=status.HTTP_400_BAD_REQUEST)
        if booking.status in ('SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB', 'REPORT_READY', 'CANCELLED'):
            return Response({'success': False, 'message': f'Cannot cancel a booking that is {booking.status.replace("_", " ").lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        booking.status = 'CANCELLED'
        booking.save(update_fields=['status'])
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Booking cancelled.'})


class LabTestBookingTrackingView(APIView):
    """Live(ish) collector tracking for the patient's own booking — the lab counterpart to
    OrderTrackingView. One collector per booking rather than one rider per fulfillment, so this
    returns a single payload instead of a list. See lab_collection.collector_tracking_payload()
    for the shape and for why coordinates are withheld outside the live window."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            booking = LabTestBooking.objects.select_related('collector__user', 'address').get(id=pk, user=request.user)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'tracking': collector_tracking_payload(booking)}})


class LabReportShareView(APIView):
    """The patient hands a finished report to a doctor — and takes it back.

    A doctor's view of a patient is deliberately narrow (see DoctorPatientDetailView: only what
    happened with that doctor, nothing else from the account), so a report does NOT become visible
    to the doctor who ordered it just because it exists. It becomes visible when the patient says
    so, here. That keeps the ordering doctor and any other doctor the patient has consulted on the
    same footing: both need an explicit share, neither gets automatic access.

    GET    — who this report can be sent to, and who it has already been sent to.
    POST   — send it to one doctor. Idempotent: re-sending is not a second notification.
    DELETE — take it back. The share row is the whole grant, so deleting it is the revoke.
    """
    permission_classes = [IsAuthenticated]

    def _booking(self, request, pk):
        # Scoped to request.user: only the account that booked the test can share its report, even
        # when the sample was collected from someone else (patient_name et al).
        return LabTestBooking.objects.select_related('lab_test', 'user').filter(id=pk, user=request.user).first()

    def _shares(self, booking):
        shares = booking.report_shares.select_related('doctor').order_by('-shared_at')
        return [{
            'id': str(s.id), 'doctor_id': str(s.doctor_id), 'doctor_name': s.doctor.name,
            'shared_at': s.shared_at,
        } for s in shares]

    def get(self, request, pk):
        booking = self._booking(request, pk)
        if not booking:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Only doctors this patient has actually consulted, and only those with a login — a legacy
        # Doctor row with no User has nowhere to receive a share, so offering it would be a dead end.
        ordering = _booking_ordering_doctor(booking)
        doctors = Doctor.objects.filter(
            appointments__user=request.user, user__isnull=False,
        ).distinct().order_by('name')

        return Response({'success': True, 'data': {
            'report_ready': bool(booking.report_file),
            'doctors': [{
                'id': str(d.id), 'name': d.name, 'specialty': d.specialty,
                'ordered_this_test': bool(ordering and ordering.id == d.id),
            } for d in doctors],
            'shares': self._shares(booking),
        }})

    def post(self, request, pk):
        booking = self._booking(request, pk)
        if not booking:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        # The file is the thing being shared, so the file's existence is the gate — not the status,
        # which could later gain steps after REPORT_READY.
        if not booking.report_file:
            return Response({'success': False, 'message': 'There is no report on this booking yet.'}, status=status.HTTP_400_BAD_REQUEST)

        doctor_id = request.data.get('doctor_id')
        if not doctor_id:
            return Response({'success': False, 'message': 'doctor_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        doctor = Doctor.objects.select_related('user').filter(id=doctor_id, user__isnull=False).first()
        if not doctor:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        # You can only send your records to a doctor you've actually seen. Without this a patient
        # could push their file at any doctor on the platform, and every doctor's shared-report list
        # would be open to strangers.
        if not DoctorAppointment.objects.filter(doctor=doctor, user=request.user).exists():
            return Response({'success': False, 'message': 'You can only send reports to a doctor you have consulted.'}, status=status.HTTP_403_FORBIDDEN)

        share, created = LabReportShare.objects.get_or_create(
            booking=booking, doctor=doctor, defaults={'shared_by': request.user},
        )
        if created:
            notify_user(
                doctor.user, 'LAB_BOOKING_UPDATE', 'Lab Report Shared With You',
                f'{booking.user.full_name} shared their {booking.lab_test.name} report with you.',
                link=f'/doctor/patients/{booking.user_id}',
            )

        return Response({
            'success': True,
            'data': {'shares': self._shares(booking)},
            'message': f'Report sent to Dr. {doctor.name}.' if created else f'Dr. {doctor.name} already has this report.',
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def delete(self, request, pk):
        booking = self._booking(request, pk)
        if not booking:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        doctor_id = request.query_params.get('doctor_id') or request.data.get('doctor_id')
        if not doctor_id:
            return Response({'success': False, 'message': 'doctor_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = LabReportShare.objects.filter(booking=booking, doctor_id=doctor_id).delete()
        if not deleted:
            return Response({'success': False, 'message': 'This report is not shared with that doctor.'}, status=status.HTTP_404_NOT_FOUND)
        # No notification on revoke — telling a doctor "access removed" turns a quiet, ordinary
        # decision by the patient into something they have to explain.
        return Response({'success': True, 'data': {'shares': self._shares(booking)}, 'message': 'Access removed.'})


# ─── Lab Test Sample Collection: Payment ───────────────────────────────────────
#
# Mirrors PaymentKhaltiInitiateView/KhaltiVerifyView and PaymentEsewaInitiateView/EsewaSuccessView/
# EsewaFailureView's exact structure, scoped to LabTestBooking instead of Order — no cart/coupon/
# wallet/delivery-charge here, same reasoning as the appointment payment views: a lab test booking
# is a single already-priced item, not a multi-item checkout.

def _booking_ordering_doctor(booking):
    """The doctor who suggested this test during a consultation, or None if the patient booked it
    off their own bat. The link is PrescriptionLabTestItem.booking, set at booking creation when the
    patient arrives from a prescription's suggested-tests list — so this resolves only for tests a
    doctor actually ordered, never for a self-booked one. Returns the Doctor, not the User: callers
    still have to check `.user_id` because the legacy Doctor rows have no login to notify."""
    item = (
        PrescriptionLabTestItem.objects
        .filter(booking=booking, prescription__appointment__isnull=False)
        .select_related('prescription__appointment__doctor__user')
        .first()
    )
    return item.prescription.appointment.doctor if item else None


def _confirm_lab_test_booking(booking, notify=True):
    """The one place a booking moves PENDING -> CONFIRMED — called either the moment
    CASH_ON_DELIVERY is selected at booking time, or the moment a Khalti/eSewa payment is verified.
    Decision: auto-confirm, no admin review step. This matches every other marketplace flow already
    built here — PaymentCodPlaceView confirms a COD order straight to PLACED via sync_order_status(),
    and a Plus-free doctor appointment confirms immediately with no admin gate — admin review in
    this codebase is reserved for things that need human judgment (verifying a pharmacy, curating a
    prescription), not for "did payment settle," which is already a deterministic, machine-checkable
    fact. CONFIRMED is the state a booking needs to reach before admin can assign it a collector
    (AdminLabTestBookingAssignCollectorView) — assignment itself is a separate, manual admin step,
    not triggered from here.

    notify=False suppresses the per-booking customer + admin notifications. A cart checkout confirms
    several bookings at once and sends a single aggregated summary instead (see the cart/group flow),
    so it passes notify=False here to avoid fanning out N customer emails + N×admins emails.
    """
    if booking.status != 'PENDING':
        return
    booking.status = 'CONFIRMED'
    booking.save(update_fields=['status'])

    # The doctor who ordered this test is told it was actually booked — they asked for it during a
    # consultation and until now had no way to know whether the patient followed through. This sits
    # ABOVE the `notify` guard on purpose: that flag exists to collapse the customer/admin fan-out
    # for a cart checkout into one aggregated summary, and there is no aggregated equivalent for a
    # doctor, who is only ever told about the specific test they themselves ordered.
    ordering_doctor = _booking_ordering_doctor(booking)
    if ordering_doctor and ordering_doctor.user_id:
        notify_user(
            ordering_doctor.user, 'LAB_BOOKING_UPDATE', 'Patient Booked a Test You Ordered',
            f'{booking.user.full_name} booked {booking.lab_test.name} for '
            f'{booking.scheduled_date.strftime("%b %d, %Y")}. '
            f'The report will appear here if they choose to share it with you.',
            link=f'/doctor/patients/{booking.user_id}',
        )

    if not notify:
        return

    # Single, idempotent notification point (the guard above ensures it fires exactly once):
    # notify the customer and the admins here, never at booking creation. For COD this runs at
    # creation with payment still PENDING (-> "pay at collection"); for Khalti/eSewa it runs from
    # the gateway verify view once payment_status is already PAID (-> "payment received").
    date_label = booking.scheduled_date.strftime('%b %d, %Y')
    paid = booking.payment_status == 'PAID'
    customer_payment_line = 'Payment received.' if paid else 'Please pay by cash at the time of sample collection.'
    notify_user(
        booking.user, 'LAB_BOOKING_UPDATE', 'Lab Test Booking Confirmed',
        f'{booking.lab_test.name} is booked for {date_label}, {booking.time_slot}. '
        f'{customer_payment_line} Amount: NPR {booking.total_amount}.',
        link='/lab-test-bookings',
    )
    _notify_admins(
        'manage_lab_tests', 'NEW_LAB_BOOKING', 'New Lab Test Booking',
        f'{booking.user.full_name} booked {booking.lab_test.name} for {date_label} '
        f'({booking.time_slot}). {"Paid online" if paid else "Cash on collection"} — NPR {booking.total_amount}.',
        link='/admin/lab-tests',
    )


def _cancel_unpaid_lab_test_booking(booking):
    if booking.payment_status == 'PENDING' and booking.status == 'PENDING':
        booking.status = 'CANCELLED'
        booking.save(update_fields=['status'])


def _upload_lab_report(booking, file):
    """The one gated place a report actually attaches and a booking moves to REPORT_READY — shared
    by the admin and collector-facing upload endpoints so neither can bypass the other's rules.
    Requires SAMPLE_COLLECTED (a real person actually collected the sample) AND payment_status ==
    PAID (settled online, or the COD amount was confirmed and recorded as a CollectorCodLiability
    by collector_confirm_sample_collected()) — both must already be true, not fixed up here.
    SUBMITTED_TO_LAB is also accepted (it's a post-collection progress step, not a reset): a report
    can attach whether or not the collector marked the sample handed off to the lab first."""
    if booking.status not in ('SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB'):
        return False, f'Cannot upload a report for a booking that is {booking.status.replace("_", " ").lower()} — the sample must be collected first.'
    if booking.payment_status != 'PAID':
        return False, 'Cannot upload a report until payment is settled.'

    booking.report_file = file
    booking.report_uploaded_at = timezone.now()
    booking.status = 'REPORT_READY'
    booking.save(update_fields=['report_file', 'report_uploaded_at', 'status'])

    # In-app row links to the bookings page (report is viewable/downloadable there — notification
    # clicks route internally); the email carries the report itself as an attachment. Split like the
    # account-welcome flows so the file-bearing email doesn't ALSO fire the generic notify email.
    # If a doctor ordered this test, the row doubles as the prompt to send it back to them — that
    # hand-off is the patient's to make, so it's an invitation here, never an automatic share.
    ordering_doctor = _booking_ordering_doctor(booking)
    share_hint = (
        f' Dr. {ordering_doctor.name} ordered this test — you can send them the report from there.'
        if ordering_doctor and ordering_doctor.user_id else ''
    )
    Notification.objects.create(
        user=booking.user, type='LAB_BOOKING_UPDATE', title='Report Ready',
        message=f'Your {booking.lab_test.name} report is ready — view or download it from your bookings.{share_hint}',
        link='/lab-test-bookings',
    )
    send_lab_report_ready_email(booking)
    return True, None


class PaymentKhaltiInitiateLabTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return Response({'success': False, 'message': 'booking_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking = LabTestBooking.objects.select_related('lab_test').get(id=booking_id, user=request.user)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        if booking.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This booking does not need payment (status: {booking.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        amount_paisa = int(round(float(booking.total_amount) * 100))
        if amount_paisa < 1000:
            return Response({'success': False, 'message': 'Khalti requires a minimum payable amount of NPR 10. Please choose another payment method.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            khalti_res = _khalti_post('/epayment/initiate/', {
                'return_url': f'{BACKEND_URL}/api/payment/khalti/verify-lab-test/',
                'website_url': FRONTEND_URL,
                'amount': amount_paisa,
                'purchase_order_id': str(booking.id),
                'purchase_order_name': f'Swasthaya Lab Test: {booking.lab_test.name}',
                'customer_info': {
                    'name': request.user.full_name,
                    'email': request.user.email,
                    'phone': request.user.phone or '9800000000',
                },
            })
        except Exception:
            return Response({'success': False, 'message': 'Failed to reach Khalti.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not khalti_res.get('pidx'):
            return Response({'success': False, 'message': khalti_res.get('detail') or khalti_res.get('message') or 'Khalti initiation failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        booking.payment_method = 'KHALTI'
        booking.khalti_pidx = khalti_res['pidx']
        booking.save(update_fields=['payment_method', 'khalti_pidx'])
        return Response({'success': True, 'data': {'payment_url': khalti_res['payment_url']}})


class LabTestKhaltiVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        pidx = request.query_params.get('pidx')
        gateway_status = request.query_params.get('status')

        if not pidx or gateway_status != 'Completed':
            if pidx:
                try:
                    _cancel_unpaid_lab_test_booking(LabTestBooking.objects.get(khalti_pidx=pidx))
                except LabTestBooking.DoesNotExist:
                    pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=khalti_cancelled')

        try:
            verification = _khalti_post('/epayment/lookup/', {'pidx': pidx})
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=verify_error')

        if verification.get('status') != 'Completed':
            try:
                _cancel_unpaid_lab_test_booking(LabTestBooking.objects.get(khalti_pidx=pidx))
            except LabTestBooking.DoesNotExist:
                pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=not_verified')

        try:
            booking = LabTestBooking.objects.get(khalti_pidx=pidx)
        except LabTestBooking.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=booking_not_found')

        if booking.payment_status != 'PAID':
            booking.payment_status = 'PAID'
            booking.save(update_fields=['payment_status'])
            _confirm_lab_test_booking(booking)
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-confirmation?bookingId={booking.id}')


class PaymentEsewaInitiateLabTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get('booking_id')
        if not booking_id:
            return Response({'success': False, 'message': 'booking_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking = LabTestBooking.objects.get(id=booking_id, user=request.user)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        if booking.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This booking does not need payment (status: {booking.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        booking.payment_method = 'ESEWA'
        transaction_uuid = f'{booking.id}-{int(timezone.now().timestamp())}'
        booking.esewa_transaction_uuid = transaction_uuid
        booking.save(update_fields=['payment_method', 'esewa_transaction_uuid'])

        total_str = str(booking.total_amount)
        signature = _esewa_signature(total_str, transaction_uuid)

        return Response({
            'success': True,
            'data': {
                'formUrl': ESEWA_FORM_URL,
                'params': {
                    'amount': total_str,
                    'tax_amount': '0',
                    'total_amount': total_str,
                    'transaction_uuid': transaction_uuid,
                    'product_code': ESEWA_PRODUCT_CODE,
                    'product_service_charge': '0',
                    'product_delivery_charge': '0',
                    'success_url': f'{BACKEND_URL}/api/payment/esewa/success-lab-test/',
                    'failure_url': f'{BACKEND_URL}/api/payment/esewa/failure-lab-test/',
                    'signed_field_names': 'total_amount,transaction_uuid,product_code',
                    'signature': signature,
                },
            },
        })


class LabTestEsewaSuccessView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if not data:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=missing_data')
        try:
            decoded = json.loads(base64.b64decode(data).decode('utf-8'))
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=bad_data')

        if decoded.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=incomplete')

        try:
            resp = requests.get(ESEWA_VERIFY_URL, params={
                'product_code': ESEWA_PRODUCT_CODE,
                'total_amount': decoded.get('total_amount'),
                'transaction_uuid': decoded.get('transaction_uuid'),
            }, timeout=10)
            verification = resp.json()
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=verify_error')

        if verification.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=not_verified')

        try:
            booking = LabTestBooking.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
        except LabTestBooking.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=booking_not_found')

        if booking.payment_status != 'PAID':
            booking.payment_status = 'PAID'
            booking.save(update_fields=['payment_status'])
            _confirm_lab_test_booking(booking)
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-confirmation?bookingId={booking.id}')


class LabTestEsewaFailureView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if data:
            try:
                decoded = json.loads(base64.b64decode(data).decode('utf-8'))
                booking = LabTestBooking.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
                _cancel_unpaid_lab_test_booking(booking)
            except Exception:
                pass
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=esewa_cancelled')


# ─── Lab Test Cart: multi-test checkout + combined group payment ────────────────
#
# A cart checkout creates one LabTestBooking per selected test (each keeps its own status/collector/
# report) but ties them to a single LabBookingGroup that owns the one shared payment — mirroring how
# a medicine Order owns many OrderItems with the payment identifiers on the Order. COD confirms every
# booking at once; Khalti/eSewa settle the summed total in one gateway round trip against the group.
# The single-test flow above is untouched (those bookings have group=NULL and pay individually).

def _notify_lab_group_confirmed(group):
    """One aggregated customer + admin notification for a whole cart, in place of the per-booking
    notification _confirm_lab_test_booking() would otherwise send once per booking (which for a cart
    of N tests would be N customer emails + N×admins emails)."""
    bookings = list(group.bookings.select_related('lab_test').all())
    if not bookings:
        return
    first = bookings[0]
    n = len(bookings)
    plural = 's' if n != 1 else ''
    date_label = first.scheduled_date.strftime('%b %d, %Y')
    paid = group.payment_status == 'PAID'
    test_names = ', '.join(b.lab_test.name for b in bookings)
    customer_line = 'Payment received.' if paid else 'Please pay by cash at the time of sample collection.'
    notify_user(
        group.user, 'LAB_BOOKING_UPDATE', 'Lab Tests Booked',
        f'{n} lab test{plural} booked for {date_label}, {first.time_slot}: {test_names}. '
        f'{customer_line} Total: NPR {group.total_amount}.',
        link='/lab-test-bookings',
    )
    _notify_admins(
        'manage_lab_tests', 'NEW_LAB_BOOKING', 'New Lab Test Booking',
        f'{group.user.full_name} booked {n} lab test{plural} for {date_label} '
        f'({first.time_slot}). {"Paid online" if paid else "Cash on collection"} — NPR {group.total_amount}.',
        link='/admin/lab-tests',
    )


def _finalize_paid_lab_group(group):
    """Idempotently settle a whole cart once its single shared payment verifies: mark the group and
    every child booking PAID, confirm each (suppressing the per-booking notification), then fire one
    aggregated summary. Mirrors _finalize_paid_order for medicine orders."""
    if group.payment_status == 'PAID':
        return
    group.payment_status = 'PAID'
    group.save(update_fields=['payment_status'])
    for booking in group.bookings.all():
        if booking.payment_status != 'PAID':
            booking.payment_status = 'PAID'
            booking.save(update_fields=['payment_status'])
        _confirm_lab_test_booking(booking, notify=False)
    _notify_lab_group_confirmed(group)


def _cancel_unpaid_lab_group(group):
    """Gateway cancelled/failed before settling: cancel each still-unpaid, still-pending child
    booking (reuses the per-booking guard so a partially-progressed booking is never touched)."""
    for booking in group.bookings.all():
        _cancel_unpaid_lab_test_booking(booking)


class LabTestCartCheckoutView(APIView):
    """Multi-test cart checkout. One request -> one LabBookingGroup + one LabTestBooking per item,
    all sharing the checkout's address/date/time-slot and one payment. Mirrors
    LabTestBookingListCreateView.post per item (validate test/address/slot, price = lab_test.price,
    bump total_bookings) but batches them. COD confirms them all immediately with a single aggregated
    notification; Khalti/eSewa leave the bookings PENDING and return the group id for the client to
    drive the group payment initiate + gateway round trip."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = request.data.get('items')
        if not isinstance(items, list) or not items:
            return Response({'success': False, 'message': 'items must be a non-empty list of lab test ids.'}, status=status.HTTP_400_BAD_REQUEST)

        scheduled_date = request.data.get('scheduled_date')
        time_slot = request.data.get('time_slot')
        notes = request.data.get('notes')
        payment_method = request.data.get('payment_method')

        if not scheduled_date:
            return Response({'success': False, 'message': 'scheduled_date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if time_slot not in TIME_SLOTS:
            return Response({'success': False, 'message': 'Invalid time slot.'}, status=status.HTTP_400_BAD_REQUEST)
        if payment_method not in ('KHALTI', 'ESEWA', 'CASH_ON_DELIVERY'):
            return Response({'success': False, 'message': "payment_method must be one of: KHALTI, ESEWA, CASH_ON_DELIVERY."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            address = Address.objects.get(id=request.data.get('address_id'), user=request.user)
        except (Address.DoesNotExist, ValueError, TypeError):
            return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, msg = check_address_serviceable(address)
        if not ok:
            return Response({'success': False, 'message': msg}, status=status.HTTP_400_BAD_REQUEST)

        # Each item is one booking line. It may be a bare test id (books for the account holder) or
        # an object {lab_test_id, patient_name, patient_phone, patient_age, patient_gender} naming who
        # this line's collection is for. Duplicates are intentionally NOT collapsed: the same test can
        # legitimately appear more than once — once per person it's booked for. Parse ids up front (a
        # malformed UUID would otherwise 500 on the lookup); any id that doesn't resolve to an active
        # test fails the whole checkout rather than silently dropping a paid-for line.
        lines = []  # (uuid, patient_kwargs)
        try:
            for entry in items:
                if isinstance(entry, dict):
                    raw_id = entry.get('lab_test_id') or entry.get('id')
                    patient = _clean_patient_fields(entry)
                else:
                    raw_id = entry
                    patient = _clean_patient_fields({})
                lines.append((uuid_lib.UUID(str(raw_id)), patient))
        except (ValueError, TypeError, AttributeError):
            return Response({'success': False, 'message': 'One or more selected tests are invalid.'}, status=status.HTTP_400_BAD_REQUEST)

        unique_ids = list({tid for tid, _ in lines})
        by_id = {t.id: t for t in LabTest.objects.filter(id__in=unique_ids, is_active=True)}
        if len(by_id) != len(unique_ids):
            return Response({'success': False, 'message': 'One or more selected tests are unavailable.'}, status=status.HTTP_404_NOT_FOUND)

        total = sum((by_id[tid].price for tid, _ in lines), Decimal('0'))

        with transaction.atomic():
            group = LabBookingGroup.objects.create(user=request.user, total_amount=total, payment_method=payment_method)
            bookings = [
                LabTestBooking.objects.create(
                    user=request.user, lab_test=by_id[tid], address=address, scheduled_date=scheduled_date,
                    time_slot=time_slot, total_amount=by_id[tid].price, notes=notes, payment_method=payment_method,
                    group=group, **patient,
                )
                for tid, patient in lines
            ]
            # Bump each test's booking counter now, for both online and COD — same as the single-test
            # flow, which counts a booking at creation regardless of whether payment later settles. A
            # test booked for two people is two bookings, so count per line (aggregated per test id).
            per_test = {}
            for tid, _ in lines:
                per_test[tid] = per_test.get(tid, 0) + 1
            for tid, n in per_test.items():
                LabTest.objects.filter(id=tid).update(total_bookings=F('total_bookings') + n)
            if payment_method == 'CASH_ON_DELIVERY':
                for b in bookings:
                    _confirm_lab_test_booking(b, notify=False)

        # Notify outside the transaction (email/DB-write side effects shouldn't hold the row locks).
        if payment_method == 'CASH_ON_DELIVERY':
            _notify_lab_group_confirmed(group)

        return Response({'success': True, 'data': {'group_id': str(group.id)}, 'message': 'Lab tests booked!'}, status=status.HTTP_201_CREATED)


class PaymentKhaltiInitiateLabGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        group_id = request.data.get('group_id')
        if not group_id:
            return Response({'success': False, 'message': 'group_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            group = LabBookingGroup.objects.get(id=group_id, user=request.user)
        except (LabBookingGroup.DoesNotExist, ValueError, TypeError):
            return Response({'success': False, 'message': 'Booking group not found.'}, status=status.HTTP_404_NOT_FOUND)

        if group.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This checkout does not need payment (status: {group.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        amount_paisa = int(round(float(group.total_amount) * 100))
        if amount_paisa < 1000:
            return Response({'success': False, 'message': 'Khalti requires a minimum payable amount of NPR 10. Please choose another payment method.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            khalti_res = _khalti_post('/epayment/initiate/', {
                'return_url': f'{BACKEND_URL}/api/payment/khalti/verify-lab-group/',
                'website_url': FRONTEND_URL,
                'amount': amount_paisa,
                'purchase_order_id': str(group.id),
                'purchase_order_name': f'Swasthaya Lab Tests ({group.bookings.count()} tests)',
                'customer_info': {
                    'name': request.user.full_name,
                    'email': request.user.email,
                    'phone': request.user.phone or '9800000000',
                },
            })
        except Exception:
            return Response({'success': False, 'message': 'Failed to reach Khalti.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not khalti_res.get('pidx'):
            return Response({'success': False, 'message': khalti_res.get('detail') or khalti_res.get('message') or 'Khalti initiation failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        group.khalti_pidx = khalti_res['pidx']
        group.save(update_fields=['khalti_pidx'])
        return Response({'success': True, 'data': {'payment_url': khalti_res['payment_url']}})


class LabGroupKhaltiVerifyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        pidx = request.query_params.get('pidx')
        gateway_status = request.query_params.get('status')

        if not pidx or gateway_status != 'Completed':
            if pidx:
                try:
                    _cancel_unpaid_lab_group(LabBookingGroup.objects.get(khalti_pidx=pidx))
                except LabBookingGroup.DoesNotExist:
                    pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=khalti_cancelled')

        try:
            verification = _khalti_post('/epayment/lookup/', {'pidx': pidx})
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=verify_error')

        if verification.get('status') != 'Completed':
            try:
                _cancel_unpaid_lab_group(LabBookingGroup.objects.get(khalti_pidx=pidx))
            except LabBookingGroup.DoesNotExist:
                pass
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=not_verified')

        try:
            group = LabBookingGroup.objects.get(khalti_pidx=pidx)
        except LabBookingGroup.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=booking_not_found')

        _finalize_paid_lab_group(group)
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/cart/confirmation?groupId={group.id}')


class PaymentEsewaInitiateLabGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        group_id = request.data.get('group_id')
        if not group_id:
            return Response({'success': False, 'message': 'group_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            group = LabBookingGroup.objects.get(id=group_id, user=request.user)
        except (LabBookingGroup.DoesNotExist, ValueError, TypeError):
            return Response({'success': False, 'message': 'Booking group not found.'}, status=status.HTTP_404_NOT_FOUND)

        if group.payment_status != 'PENDING':
            return Response({'success': False, 'message': f'This checkout does not need payment (status: {group.payment_status}).'}, status=status.HTTP_400_BAD_REQUEST)

        transaction_uuid = f'{group.id}-{int(timezone.now().timestamp())}'
        group.esewa_transaction_uuid = transaction_uuid
        group.save(update_fields=['esewa_transaction_uuid'])

        total_str = str(group.total_amount)
        signature = _esewa_signature(total_str, transaction_uuid)

        return Response({
            'success': True,
            'data': {
                'formUrl': ESEWA_FORM_URL,
                'params': {
                    'amount': total_str,
                    'tax_amount': '0',
                    'total_amount': total_str,
                    'transaction_uuid': transaction_uuid,
                    'product_code': ESEWA_PRODUCT_CODE,
                    'product_service_charge': '0',
                    'product_delivery_charge': '0',
                    'success_url': f'{BACKEND_URL}/api/payment/esewa/success-lab-group/',
                    'failure_url': f'{BACKEND_URL}/api/payment/esewa/failure-lab-group/',
                    'signed_field_names': 'total_amount,transaction_uuid,product_code',
                    'signature': signature,
                },
            },
        })


class LabGroupEsewaSuccessView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if not data:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=missing_data')
        try:
            decoded = json.loads(base64.b64decode(data).decode('utf-8'))
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=bad_data')

        if decoded.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=incomplete')

        try:
            resp = requests.get(ESEWA_VERIFY_URL, params={
                'product_code': ESEWA_PRODUCT_CODE,
                'total_amount': decoded.get('total_amount'),
                'transaction_uuid': decoded.get('transaction_uuid'),
            }, timeout=10)
            verification = resp.json()
        except Exception:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=verify_error')

        if verification.get('status') != 'COMPLETE':
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=not_verified')

        try:
            group = LabBookingGroup.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid'))
        except LabBookingGroup.DoesNotExist:
            return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=booking_not_found')

        _finalize_paid_lab_group(group)
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/cart/confirmation?groupId={group.id}')


class LabGroupEsewaFailureView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        data = request.query_params.get('data')
        if data:
            try:
                decoded = json.loads(base64.b64decode(data).decode('utf-8'))
                _cancel_unpaid_lab_group(LabBookingGroup.objects.get(esewa_transaction_uuid=decoded.get('transaction_uuid')))
            except Exception:
                pass
        return HttpResponseRedirect(f'{FRONTEND_URL}/lab-tests/payment-failed?reason=esewa_cancelled')


class LabBookingGroupDetailView(APIView):
    """Owner-scoped read of a cart checkout and the bookings it produced — backs the cart
    confirmation page (?groupId=...)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            group = LabBookingGroup.objects.prefetch_related(
                'bookings__lab_test__category', 'bookings__address', 'bookings__collector__user',
            ).get(id=pk, user=request.user)
        except LabBookingGroup.DoesNotExist:
            return Response({'success': False, 'message': 'Booking group not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'group': LabBookingGroupSerializer(group, context={'request': request}).data}})


# ─── Blog ─────────────────────────────────────────────────────────────────────

class BlogPostListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = BlogPost.objects.filter(is_published=True)
        search = request.query_params.get('search', '').strip()
        category = request.query_params.get('category', '').strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(excerpt__icontains=search))
        if category:
            qs = qs.filter(category__iexact=category)

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(50, max(1, int(request.query_params.get('limit', 12))))
        except ValueError:
            page, limit = 1, 12
        total = qs.count()
        posts = qs[(page - 1) * limit: page * limit]

        return Response({
            'success': True,
            'data': {
                'posts': BlogPostListSerializer(posts, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class BlogPostDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        try:
            post = BlogPost.objects.get(slug=slug, is_published=True)
        except BlogPost.DoesNotExist:
            return Response({'success': False, 'message': 'Article not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'post': BlogPostDetailSerializer(post).data}})


class BlogCategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = list(
            BlogPost.objects.filter(is_published=True).exclude(category__isnull=True).exclude(category='')
            .values_list('category', flat=True).distinct().order_by('category')
        )
        return Response({'success': True, 'data': {'categories': categories}})


# ─── Subscriptions (Auto-Refill) ───────────────────────────────────────────────

class SubscriptionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        subs = MedicineSubscription.objects.filter(user=request.user).select_related('medicine__category', 'medicine__brand', 'address').order_by('-is_active', 'next_delivery_date')
        return Response({'success': True, 'data': {'subscriptions': MedicineSubscriptionSerializer(subs, many=True).data}})

    def post(self, request):
        s = MedicineSubscriptionSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            medicine = Medicine.objects.get(id=s.validated_data['medicine_id'])
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not _user_has_purchased(request.user, medicine):
            return Response(
                {'success': False, 'message': "You can only set up auto-refill for a medicine you've already purchased."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        address = None
        address_id = s.validated_data.get('address_id')
        if address_id:
            try:
                address = Address.objects.get(id=address_id, user=request.user)
            except Address.DoesNotExist:
                return Response({'success': False, 'message': 'Address not found.'}, status=status.HTTP_404_NOT_FOUND)
            ok, msg = check_address_serviceable(address)
            if not ok:
                return Response({'success': False, 'message': msg}, status=status.HTTP_400_BAD_REQUEST)

        frequency_days = s.validated_data.get('frequency_days', 30)
        sub = MedicineSubscription.objects.create(
            user=request.user,
            medicine=medicine,
            address=address,
            quantity=s.validated_data.get('quantity', 1),
            frequency_days=frequency_days,
            next_delivery_date=timezone.now().date() + timedelta(days=frequency_days),
        )
        _notify_admins('manage_subscriptions', 'NEW_SUBSCRIPTION', 'New Subscription',
                        f'{request.user.full_name} subscribed to {medicine.name}.', link='/admin/subscriptions')
        return Response({'success': True, 'data': {'subscription': MedicineSubscriptionSerializer(sub).data}, 'message': 'Subscribed for auto-refill!'}, status=status.HTTP_201_CREATED)


class SubscriptionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            sub = MedicineSubscription.objects.get(id=pk, user=request.user)
        except MedicineSubscription.DoesNotExist:
            return Response({'success': False, 'message': 'Subscription not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'is_active' in request.data:
            sub.is_active = bool(request.data['is_active'])
        if 'quantity' in request.data:
            sub.quantity = max(1, int(request.data['quantity']))
        if 'frequency_days' in request.data:
            sub.frequency_days = int(request.data['frequency_days'])
        if 'address_id' in request.data and request.data['address_id']:
            try:
                sub.address = Address.objects.get(id=request.data['address_id'], user=request.user)
            except Address.DoesNotExist:
                pass
        sub.save()
        return Response({'success': True, 'data': {'subscription': MedicineSubscriptionSerializer(sub).data}, 'message': 'Subscription updated.'})

    def delete(self, request, pk):
        try:
            sub = MedicineSubscription.objects.get(id=pk, user=request.user)
        except MedicineSubscription.DoesNotExist:
            return Response({'success': False, 'message': 'Subscription not found.'}, status=status.HTTP_404_NOT_FOUND)
        sub.delete()
        return Response({'success': True, 'message': 'Subscription cancelled.'})


# ─── Doctor Consult ─────────────────────────────────────────────────────────────

class DoctorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Doctor.objects.filter(is_active=True).prefetch_related('documents')
        search = request.query_params.get('search', '').strip()
        specialty = request.query_params.get('specialty', '').strip()
        sort = request.query_params.get('sortBy', 'popular')
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(specialty__icontains=search))
        if specialty:
            names = [s.strip() for s in specialty.split(',') if s.strip()]
            if names:
                qs = qs.filter(specialty__in=names)
        sort_map = {'popular': '-total_consultations', 'price-asc': 'consultation_fee', 'rating': '-rating'}
        qs = qs.order_by(sort_map.get(sort, '-total_consultations'))
        return Response({'success': True, 'data': {'doctors': DoctorSerializer(qs, many=True, context={'request': request}).data}})


class DoctorSpecialtyListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        specialties = list(Doctor.objects.filter(is_active=True).values_list('specialty', flat=True).distinct().order_by('specialty'))
        return Response({'success': True, 'data': {'specialties': specialties}})


class DoctorDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.prefetch_related('documents').get(id=pk, is_active=True)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'doctor': DoctorSerializer(doctor, context={'request': request}).data}})


class DoctorSlotsView(APIView):
    """Real available slots for a given date, computed fresh from the doctor's
    DoctorAvailability weekly pattern — see scheduling.get_available_slots()."""
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk, is_active=True)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        date_str = request.query_params.get('date')
        requested_date = parse_date(date_str) if date_str else None
        if not requested_date:
            return Response({'success': False, 'message': 'A valid date query param (YYYY-MM-DD) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'success': True, 'data': {'slots': get_available_slots(doctor, requested_date)}})


class AppointmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        appts = (
            DoctorAppointment.objects.filter(user=request.user)
            .select_related('doctor')
            .prefetch_related(*APPOINTMENT_PRESCRIPTION_PREFETCH)
            .order_by('-booked_at')
        )
        # context={'request': request} so the serializer can build an absolute prescription PDF URL
        # in local dev (where MEDIA_URL is a relative /media/ path); in prod the R2 URL is already
        # absolute and the context is harmless.
        return Response({'success': True, 'data': {'appointments': DoctorAppointmentSerializer(appts, many=True, context={'request': request}).data}})

    def post(self, request):
        s = DoctorAppointmentSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            doctor = Doctor.objects.get(id=s.validated_data['doctor_id'], is_active=True)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        scheduled_date = s.validated_data['scheduled_date']
        time_slot = s.validated_data['time_slot']
        # Re-checked here rather than trusted from the slots endpoint response — someone else may
        # have booked this exact slot between the patient viewing it and submitting the booking.
        if time_slot not in get_available_slots(doctor, scheduled_date):
            return Response({'success': False, 'message': 'That time slot is no longer available — someone may have just booked it. Please choose another.'}, status=status.HTTP_409_CONFLICT)

        # Free only for a member whose ACTUAL plan carries the FREE_DOCTOR_CONSULTATION benefit —
        # not just "any active Plus membership" (that was the old, coarser behavior; see
        # _user_has_plus_benefit()'s docstring). The doctor is still paid their normal share (see
        # DoctorPayout) — PharmaX absorbs the discount as a Plus perk. Non-free bookings stay
        # PENDING (not yet confirmed) until payment clears.
        is_plus_free = _user_has_plus_benefit(request.user, 'FREE_DOCTOR_CONSULTATION')
        if is_plus_free:
            fee_charged, payment_status_value = Decimal('0'), 'NOT_REQUIRED'
        else:
            fee_charged, payment_status_value = doctor.consultation_fee, 'PENDING'

        appt = DoctorAppointment.objects.create(
            user=request.user,
            doctor=doctor,
            scheduled_date=scheduled_date,
            time_slot=time_slot,
            status='PENDING',
            fee_amount=doctor.consultation_fee,
            fee_charged=fee_charged,
            is_plus_free=is_plus_free,
            payment_status=payment_status_value,
            reason=s.validated_data.get('reason'),
        )
        # total_consultations counts actual completed consultations (incremented in
        # DoctorAppointmentCompleteView, alongside DoctorPayout) — not booking attempts, which
        # would inflate it with cancellations/no-shows/unpaid appointments that never happened.

        # Created PENDING above regardless of path; _confirm_appointment() is the single place an
        # appointment moves to CONFIRMED and notifies the patient + admins. A Plus-free consultation
        # confirms right here; a paid one stays PENDING until its Khalti payment verifies, so the
        # admin is no longer notified at creation about a booking whose payment may never complete.
        if is_plus_free:
            _confirm_appointment(appt)

        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt, context={'request': request}).data}, 'message': 'Appointment booked!'}, status=status.HTTP_201_CREATED)


class AppointmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            appt = DoctorAppointment.objects.get(id=pk, user=request.user)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get('status') != 'CANCELLED':
            return Response({'success': False, 'message': 'You can only cancel an appointment.'}, status=status.HTTP_400_BAD_REQUEST)
        if appt.status in ('COMPLETED', 'CANCELLED'):
            return Response({'success': False, 'message': f'Cannot cancel an appointment that is {appt.status.lower()}.'}, status=status.HTTP_400_BAD_REQUEST)

        # time_slot is always '%H:%M' (see scheduling.get_available_slots) — combined with
        # scheduled_date to get the real moment the appointment is booked for, so the window is
        # checked against the actual scheduled time, not just the date.
        window_hours = float(_get_setting('appointment_cancellation_window_hours', '1'))
        scheduled_at = timezone.make_aware(datetime.combine(appt.scheduled_date, datetime.strptime(appt.time_slot, '%H:%M').time()))
        if scheduled_at - timezone.now() < timedelta(hours=window_hours):
            window_label = f'{window_hours:g} hour' + ('s' if window_hours != 1 else '')
            return Response({'success': False, 'message': f'Appointments can only be cancelled more than {window_label} before the scheduled time.'}, status=status.HTTP_400_BAD_REQUEST)

        appt.status = 'CANCELLED'
        appt.save(update_fields=['status'])
        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt, context={'request': request}).data}, 'message': 'Appointment cancelled.'})


class AppointmentFollowUpsDueView(APIView):
    """Single source of truth for 'you have a follow-up due' — both the Notification/email trigger
    here and the customer layout's toast poll read from this same query, instead of the frontend
    deriving its own due list from the plain appointment list (which never touched the Notification
    model or respected notif_reminders at all). follow_up_notified_at makes this fire once per
    appointment, not once per poll — same discipline as ReminderLog.notified_at."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        due = list(DoctorAppointment.objects.filter(
            user=request.user, follow_up_date__isnull=False, follow_up_date__lte=today,
            follow_up_notified_at__isnull=True,
        ).select_related('doctor'))

        for appt in due:
            overdue = appt.follow_up_date < today
            message = f'Dr. {appt.doctor.name} recommended a follow-up' + (f' — {appt.follow_up_notes}' if appt.follow_up_notes else '') + '.'
            notify_user(
                user=request.user, type='REMINDER_DUE', title='Follow-up overdue' if overdue else 'Follow-up due today',
                message=message, link=f'/doctor-consult/{appt.doctor.id}',
            )
        if due:
            DoctorAppointment.objects.filter(id__in=[a.id for a in due]).update(follow_up_notified_at=timezone.now())

        return Response({'success': True, 'data': {'follow_ups': DoctorAppointmentSerializer(due, many=True, context={'request': request}).data}})


class InternalAppointmentRemindersView(APIView):
    """Unattended cron sweep that fires the pre-appointment reminders — 24h and 1h before — in-app
    AND email, for every CONFIRMED consultation. It's the piece an external scheduler hits every
    few minutes, since this project has no task runner. There's no logged-in user on a cron call,
    so instead of a JWT it's gated by a shared secret: the caller must send X-Cron-Secret matching
    settings.CRON_SECRET, and an unset secret disables the endpoint entirely (rejects every request)
    so a misconfigured deploy never runs open. reminder_24h_sent_at / reminder_1h_sent_at make each
    lead time fire exactly once — the same fire-once discipline as follow_up_notified_at — so the
    cron is safe to run as often as it likes. The two lead times use disjoint windows ([T-24h, T-1h)
    and [T-1h, T)), so a booking made less than an hour out gets only the 'starting soon' reminder,
    never both at once. type='REMINDER_DUE' routes the email to the notif_reminders opt-out."""
    permission_classes = [AllowAny]

    def post(self, request):
        secret = settings.CRON_SECRET
        provided = request.headers.get('X-Cron-Secret', '')
        # Bytes compare so a non-ASCII header can't make compare_digest raise; empty secret => deny.
        if not secret or not hmac.compare_digest(provided.encode('utf-8'), secret.encode('utf-8')):
            return Response({'success': False, 'message': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        today = now.date()
        # A 2-day date window comfortably brackets both lead times across a midnight boundary; the
        # per-appointment time math below is what actually decides whether a reminder is due.
        appts = DoctorAppointment.objects.filter(
            status='CONFIRMED', scheduled_date__gte=today, scheduled_date__lte=today + timedelta(days=2),
        ).filter(
            Q(reminder_24h_sent_at__isnull=True) | Q(reminder_1h_sent_at__isnull=True),
        ).select_related('doctor', 'user')

        sent_24h = 0
        sent_1h = 0
        for appt in appts:
            try:
                slot_time = datetime.strptime(appt.time_slot, '%H:%M').time()
            except (ValueError, TypeError):
                continue  # malformed slot string — skip this one, don't crash the whole sweep
            scheduled_at = timezone.make_aware(datetime.combine(appt.scheduled_date, slot_time))
            when = f'{appt.scheduled_date.strftime("%b %d, %Y")} at {appt.time_slot}'

            if appt.reminder_24h_sent_at is None and scheduled_at - timedelta(hours=24) <= now < scheduled_at - timedelta(hours=1):
                notify_user(
                    user=appt.user, type='REMINDER_DUE', title='Consultation tomorrow',
                    message=f'Reminder: your consultation with Dr. {appt.doctor.name} is on {when}. Join from your appointments when it starts.',
                    link='/appointments',
                )
                appt.reminder_24h_sent_at = now
                appt.save(update_fields=['reminder_24h_sent_at'])
                sent_24h += 1
            elif appt.reminder_1h_sent_at is None and scheduled_at - timedelta(hours=1) <= now < scheduled_at:
                notify_user(
                    user=appt.user, type='REMINDER_DUE', title='Consultation starting soon',
                    message=f'Your consultation with Dr. {appt.doctor.name} starts soon — {when}. Join from your appointments.',
                    link='/appointments',
                )
                appt.reminder_1h_sent_at = now
                appt.save(update_fields=['reminder_1h_sent_at'])
                sent_1h += 1

        return Response({
            'success': True,
            'data': {'reminders_24h_sent': sent_24h, 'reminders_1h_sent': sent_1h},
            'message': f'Sent {sent_24h} day-before and {sent_1h} hour-before reminder(s).',
        })


def _recalc_doctor_rating(doctor):
    agg = DoctorReview.objects.filter(doctor=doctor).aggregate(avg=Avg('rating'), cnt=Count('id'))
    doctor.rating = round(agg['avg'] or 0, 2)
    doctor.total_reviews = agg['cnt']
    doctor.save(update_fields=['rating', 'total_reviews'])


def _user_completed_appointment(user, doctor):
    return DoctorAppointment.objects.filter(user=user, doctor=doctor, status='COMPLETED').exists()


class DoctorReviewsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        reviews = DoctorReview.objects.filter(doctor_id=pk).select_related('user').order_by('-created_at')
        data = {'reviews': DoctorReviewSerializer(reviews, many=True, context={'request': request}).data}
        if request.user.is_authenticated:
            data['can_review'] = DoctorAppointment.objects.filter(user=request.user, doctor_id=pk, status='COMPLETED').exists()
        return Response({'success': True, 'data': data})

    def post(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not _user_completed_appointment(request.user, doctor):
            return Response({'success': False, 'message': 'You can only review a doctor after completing a consultation with them.'}, status=status.HTTP_403_FORBIDDEN)

        rating = _parse_rating(request.data.get('rating'))
        comment = request.data.get('comment', '')
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        review, created = DoctorReview.objects.update_or_create(
            user=request.user, doctor=doctor,
            defaults={'rating': rating, 'comment': comment},
        )
        _recalc_doctor_rating(doctor)

        return Response({'success': True, 'data': {'review': DoctorReviewSerializer(review, context={'request': request}).data}}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def put(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            review = DoctorReview.objects.get(doctor_id=pk, user=request.user)
        except DoctorReview.DoesNotExist:
            return Response({'success': False, 'message': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)

        rating = _parse_rating(request.data.get('rating'))
        if rating is None:
            return Response({'success': False, 'message': RATING_STEP_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        review.rating = rating
        review.comment = request.data.get('comment', review.comment)
        review.save(update_fields=['rating', 'comment'])
        _recalc_doctor_rating(review.doctor)

        return Response({'success': True, 'data': {'review': DoctorReviewSerializer(review, context={'request': request}).data}, 'message': 'Review updated.'})

    def delete(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            review = DoctorReview.objects.get(doctor_id=pk, user=request.user)
        except DoctorReview.DoesNotExist:
            return Response({'success': False, 'message': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
        doctor = review.doctor
        review.delete()
        _recalc_doctor_rating(doctor)
        return Response({'success': True, 'message': 'Review deleted.'})


class MyDoctorReviewsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reviews = DoctorReview.objects.filter(user=request.user).select_related('doctor').order_by('-created_at')
        return Response({'success': True, 'data': {'reviews': MyDoctorReviewSerializer(reviews, many=True, context={'request': request}).data}})


# ─── PharmaX Plus ─────────────────────────────────────────────────────────────

class PlusPlanListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        plans = PlusPlan.objects.filter(is_active=True).order_by('duration_days')
        return Response({'success': True, 'data': {'plans': PlusPlanSerializer(plans, many=True).data}})


class PlusMembershipView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            membership = PlusMembership.objects.select_related('plan').get(user=request.user)
            data = PlusMembershipSerializer(membership).data
        except PlusMembership.DoesNotExist:
            data = None
        return Response({'success': True, 'data': {'membership': data}})

    def post(self, request):
        plan_id = request.data.get('plan_id')
        try:
            plan = PlusPlan.objects.get(id=plan_id, is_active=True)
        except PlusPlan.DoesNotExist:
            return Response({'success': False, 'message': 'Plan not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        membership, created = PlusMembership.objects.get_or_create(
            user=request.user,
            defaults={'plan': plan, 'expires_at': now + timedelta(days=plan.duration_days), 'price_paid': plan.price},
        )
        if not created:
            base = membership.expires_at if membership.expires_at > now else now
            membership.plan = plan
            membership.expires_at = base + timedelta(days=plan.duration_days)
            membership.price_paid = plan.price
            membership.save()

        notify_user(
            user=request.user,
            type='PLUS',
            title='Welcome to Swasthaya Plus!',
            message=f'Your {plan.name} membership is active until {membership.expires_at.date()}.',
            link='/plus-membership',
        )
        _notify_admins('manage_plus_membership', 'NEW_PLUS_MEMBER', 'New Plus Member',
                        f'{request.user.full_name} subscribed to {plan.name}.', link='/admin/plus-membership')
        return Response({'success': True, 'data': {'membership': PlusMembershipSerializer(membership).data}, 'message': 'Membership activated!'})


class AdminPlusPlanListView(APIView):
    permission_classes = [require_permission('manage_plus_membership')]

    def get(self, request):
        plans = PlusPlan.objects.order_by('duration_days')
        return Response({'success': True, 'data': {'plans': PlusPlanSerializer(plans, many=True).data}})

    def post(self, request):
        s = PlusPlanSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        plan = s.save()
        return Response({'success': True, 'data': {'plan': PlusPlanSerializer(plan).data}}, status=status.HTTP_201_CREATED)


class AdminPlusPlanDetailView(APIView):
    permission_classes = [require_permission('manage_plus_membership')]

    def put(self, request, pk):
        try:
            plan = PlusPlan.objects.get(id=pk)
        except PlusPlan.DoesNotExist:
            return Response({'success': False, 'message': 'Plan not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = PlusPlanSerializer(plan, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'plan': s.data}})

    def delete(self, request, pk):
        try:
            plan = PlusPlan.objects.get(id=pk)
        except PlusPlan.DoesNotExist:
            return Response({'success': False, 'message': 'Plan not found.'}, status=status.HTTP_404_NOT_FOUND)
        if plan.memberships.exists():
            return Response({'success': False, 'message': 'Cannot delete a plan with active members.'}, status=status.HTTP_400_BAD_REQUEST)
        plan.delete()
        return Response({'success': True, 'message': 'Plan deleted.'})


class AdminPlusBenefitListView(APIView):
    """Scoped under a specific plan — a PlusBenefit only ever makes sense attached to one plan, so
    there's no plan-agnostic list/create."""
    permission_classes = [require_permission('manage_plus_membership')]

    def get(self, request, plan_id):
        try:
            plan = PlusPlan.objects.get(id=plan_id)
        except PlusPlan.DoesNotExist:
            return Response({'success': False, 'message': 'Plan not found.'}, status=status.HTTP_404_NOT_FOUND)
        benefits = plan.benefits.order_by('key')
        return Response({'success': True, 'data': {'benefits': PlusBenefitSerializer(benefits, many=True).data}})

    def post(self, request, plan_id):
        try:
            plan = PlusPlan.objects.get(id=plan_id)
        except PlusPlan.DoesNotExist:
            return Response({'success': False, 'message': 'Plan not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = PlusBenefitSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        if plan.benefits.filter(key=s.validated_data['key']).exists():
            return Response({'success': False, 'message': 'This plan already has a benefit with that key.'}, status=status.HTTP_400_BAD_REQUEST)
        benefit = s.save(plan=plan)
        return Response({'success': True, 'data': {'benefit': PlusBenefitSerializer(benefit).data}}, status=status.HTTP_201_CREATED)


class AdminPlusBenefitDetailView(APIView):
    permission_classes = [require_permission('manage_plus_membership')]

    def put(self, request, plan_id, pk):
        try:
            benefit = PlusBenefit.objects.get(id=pk, plan_id=plan_id)
        except PlusBenefit.DoesNotExist:
            return Response({'success': False, 'message': 'Benefit not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = PlusBenefitSerializer(benefit, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'benefit': s.data}})

    def delete(self, request, plan_id, pk):
        try:
            benefit = PlusBenefit.objects.get(id=pk, plan_id=plan_id)
        except PlusBenefit.DoesNotExist:
            return Response({'success': False, 'message': 'Benefit not found.'}, status=status.HTTP_404_NOT_FOUND)
        benefit.delete()
        return Response({'success': True, 'message': 'Benefit deleted.'})


class AdminPlusMembershipListView(APIView):
    permission_classes = [require_permission('manage_plus_membership')]

    def get(self, request):
        qs = PlusMembership.objects.select_related('plan', 'user').order_by('-created_at')
        filt = request.query_params.get('status')
        now = timezone.now()
        if filt == 'active':
            qs = qs.filter(expires_at__gt=now)
        elif filt == 'expired':
            qs = qs.filter(expires_at__lte=now)
        return Response({'success': True, 'data': {'memberships': PlusMembershipSerializer(qs, many=True).data}})


# ─── Coupons ──────────────────────────────────────────────────────────────────

class CouponValidateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get('code', '')
        try:
            subtotal = Decimal(str(request.data.get('subtotal', '0')))
        except Exception:
            return Response({'success': False, 'message': 'Invalid subtotal.'}, status=status.HTTP_400_BAD_REQUEST)

        coupon, discount, error = _validate_coupon(code, request.user, subtotal)
        if error:
            return Response({'success': False, 'message': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'data': {
            'code': coupon.code, 'discount_amount': str(discount),
            'discount_type': coupon.discount_type, 'description': coupon.description,
        }})


# ─── Wallet ───────────────────────────────────────────────────────────────────

class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        transactions = wallet.transactions.all()[:50]
        data = WalletSerializer(wallet).data
        data['transactions'] = WalletTransactionSerializer(transactions, many=True).data
        return Response({'success': True, 'data': {'wallet': data}})


# ─── Referrals ────────────────────────────────────────────────────────────────

class ReferralView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        referrals = Referral.objects.filter(referrer=request.user).select_related('referred_user').order_by('-created_at')
        rewarded_total = referrals.filter(status='REWARDED').aggregate(total=Sum('reward_amount'))['total'] or Decimal('0')
        return Response({'success': True, 'data': {
            'referral_code': request.user.referral_code,
            'referrals': ReferralSerializer(referrals, many=True).data,
            'total_earned': str(rewarded_total),
        }})


# ─── Admin: Coupons & Wallet ──────────────────────────────────────────────────

class AdminCouponListView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def get(self, request):
        coupons = Coupon.objects.annotate(times_used=Count('usages')).order_by('-created_at')
        data = CouponSerializer(coupons, many=True).data
        for i, c in enumerate(coupons):
            data[i]['times_used'] = c.times_used
        return Response({'success': True, 'data': {'coupons': data}})

    def post(self, request):
        s = CouponSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        coupon = s.save()
        return Response({'success': True, 'data': {'coupon': CouponSerializer(coupon).data}}, status=status.HTTP_201_CREATED)


class AdminCouponDetailView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def put(self, request, pk):
        try:
            coupon = Coupon.objects.get(id=pk)
        except Coupon.DoesNotExist:
            return Response({'success': False, 'message': 'Coupon not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = CouponSerializer(coupon, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'coupon': s.data}})

    def delete(self, request, pk):
        try:
            coupon = Coupon.objects.get(id=pk)
        except Coupon.DoesNotExist:
            return Response({'success': False, 'message': 'Coupon not found.'}, status=status.HTTP_404_NOT_FOUND)
        coupon.delete()
        return Response({'success': True, 'message': 'Coupon deleted.'})


# ─── Offers Page (featured deals + coupons) ────────────────────────────────────

def _active_featured_deals():
    now = timezone.now()
    return FeaturedDeal.objects.filter(is_active=True).filter(
        Q(starts_at__isnull=True) | Q(starts_at__lte=now)
    ).filter(
        Q(ends_at__isnull=True) | Q(ends_at__gte=now)
    ).select_related('medicine__category', 'medicine__brand', 'doctor', 'lab_test__category', 'plus_plan')


class OffersView(APIView):
    """Real Offers page data — admin-curated featured deals (covering medicines and services alike)
    and every currently-active coupon, together in one response."""
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        deals = list(_active_featured_deals())
        geo = _parse_geo(request)
        radius_km = None
        if geo:
            radius_km = _broadcast_radius_km()
            # Location-aware: drop medicine deals no reachable pharmacy can fulfil, and stamp the
            # survivors' medicine with nearest_km so each card shows the right express/same-day badge.
            med_ids = [d.medicine_id for d in deals if d.target_type == 'MEDICINE' and d.medicine_id]
            nearest_map = {}
            if med_ids:
                nearest_map = dict(
                    annotate_medicine_availability(
                        Medicine.objects.filter(id__in=med_ids), geo[0], geo[1],
                    ).filter(nearest_km__isnull=False).values_list('id', 'nearest_km')
                )
            kept = []
            for d in deals:
                if d.target_type == 'MEDICINE' and d.medicine_id:
                    if d.medicine_id not in nearest_map:
                        continue
                    if d.medicine is not None:
                        d.medicine.nearest_km = nearest_map[d.medicine_id]
                kept.append(d)
            deals = kept
        coupons = Coupon.objects.filter(is_active=True, valid_from__lte=now, valid_until__gte=now).order_by('-created_at')
        ctx = {'radius_km': radius_km} if geo else {}
        return Response({'success': True, 'data': {
            'featured_deals': FeaturedDealSerializer(deals, many=True, context=ctx).data,
            'coupons': CouponSerializer(coupons, many=True).data,
        }})


class AdminFeaturedDealListView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def get(self, request):
        deals = FeaturedDeal.objects.select_related('medicine', 'doctor', 'lab_test', 'plus_plan').order_by('display_order', '-created_at')
        return Response({'success': True, 'data': {'featured_deals': FeaturedDealSerializer(deals, many=True).data}})

    def post(self, request):
        s = FeaturedDealSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        deal = s.save()
        return Response({'success': True, 'data': {'featured_deal': FeaturedDealSerializer(deal).data}}, status=status.HTTP_201_CREATED)


class AdminFeaturedDealDetailView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def put(self, request, pk):
        try:
            deal = FeaturedDeal.objects.get(id=pk)
        except FeaturedDeal.DoesNotExist:
            return Response({'success': False, 'message': 'Featured deal not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = FeaturedDealSerializer(deal, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'featured_deal': FeaturedDealSerializer(deal).data}})

    def delete(self, request, pk):
        try:
            deal = FeaturedDeal.objects.get(id=pk)
        except FeaturedDeal.DoesNotExist:
            return Response({'success': False, 'message': 'Featured deal not found.'}, status=status.HTTP_404_NOT_FOUND)
        deal.delete()
        return Response({'success': True, 'message': 'Featured deal deleted.'})


# ─── Homepage Promo Banners ─────────────────────────────────────────────────────

class PromoBannerListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        banners = PromoBanner.objects.filter(is_active=True).order_by('display_order', '-created_at')
        serialized = PromoBannerSerializer(banners, many=True).data
        grouped = {choice: [] for choice, _ in PromoBanner.PLACEMENT}
        for b in serialized:
            grouped.setdefault(b['placement'], []).append(b)
        return Response({'success': True, 'data': {'banners': grouped}})


class AdminPromoBannerListView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def get(self, request):
        banners = PromoBanner.objects.order_by('display_order', '-created_at')
        return Response({'success': True, 'data': {'banners': PromoBannerSerializer(banners, many=True).data}})

    def post(self, request):
        s = PromoBannerSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        banner = s.save()
        return Response({'success': True, 'data': {'banner': PromoBannerSerializer(banner).data}}, status=status.HTTP_201_CREATED)


class AdminPromoBannerImageUploadView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def post(self, request):
        from django.core.files.storage import FileSystemStorage

        file = request.FILES.get('image')
        if not file:
            return Response({'success': False, 'message': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or GIF images are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        max_size = _document_max_size_bytes()
        if file.size > max_size:
            return Response({'success': False, 'message': f'Image must be under {max_size // (1024 * 1024)}MB.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower() or '.jpg'
        filename = f'promo_banner_{uuid_lib.uuid4().hex}{ext}'
        storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'promo_banners'))
        storage.save(filename, file)

        return Response({'success': True, 'data': {'image_url': f'/media/promo_banners/{filename}'}})


class AdminPromoBannerDetailView(APIView):
    permission_classes = [require_permission('manage_marketing')]

    def put(self, request, pk):
        try:
            banner = PromoBanner.objects.get(id=pk)
        except PromoBanner.DoesNotExist:
            return Response({'success': False, 'message': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = PromoBannerSerializer(banner, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'banner': s.data}})

    def delete(self, request, pk):
        try:
            banner = PromoBanner.objects.get(id=pk)
        except PromoBanner.DoesNotExist:
            return Response({'success': False, 'message': 'Banner not found.'}, status=status.HTTP_404_NOT_FOUND)
        banner.delete()
        return Response({'success': True, 'message': 'Banner deleted.'})


class AdminWalletListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        wallets = Wallet.objects.select_related('user').order_by('-balance')
        search = request.query_params.get('search', '').strip()
        if search:
            wallets = wallets.filter(Q(user__email__icontains=search) | Q(user__full_name__icontains=search))
        results = [{
            'id': str(w.id), 'user': {'id': str(w.user_id), 'full_name': w.user.full_name, 'email': w.user.email},
            'balance': str(w.balance), 'updated_at': w.updated_at,
        } for w in wallets]
        return Response({'success': True, 'data': {'wallets': results}})


class AdminWalletAdjustView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request):
        user_id = request.data.get('user_id')
        try:
            amount = Decimal(str(request.data.get('amount', '0')))
        except Exception:
            return Response({'success': False, 'message': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        reason = request.data.get('reason', '').strip()
        adj_type = request.data.get('type', 'CREDIT')

        if amount <= 0:
            return Response({'success': False, 'message': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'success': False, 'message': 'Reason is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        wallet, _ = Wallet.objects.get_or_create(user=user)
        if adj_type == 'DEBIT':
            if amount > wallet.balance:
                return Response({'success': False, 'message': 'Insufficient wallet balance.'}, status=status.HTTP_400_BAD_REQUEST)
            wallet.balance -= amount
        else:
            wallet.balance += amount
        wallet.save(update_fields=['balance'])
        WalletTransaction.objects.create(
            wallet=wallet, type=adj_type, amount=amount, reason=reason, balance_after=wallet.balance,
        )
        notify_user(
            user=user, type='WALLET', title='Wallet Updated',
            message=f'NPR {amount} was {"credited to" if adj_type == "CREDIT" else "debited from"} your wallet: {reason}',
            link='/wallet',
        )
        return Response({'success': True, 'data': {'wallet': {'balance': str(wallet.balance)}}, 'message': 'Wallet adjusted.'})


# ─── Health Locker ────────────────────────────────────────────────────────────

class HealthRecordListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = HealthRecord.objects.filter(user=request.user)
        return Response({'success': True, 'data': {'records': HealthRecordSerializer(records, many=True, context={'request': request}).data}})

    def post(self, request):
        title = request.data.get('title', '').strip()
        if not title:
            return Response({'success': False, 'message': 'Title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        record = HealthRecord.objects.create(
            user=request.user,
            title=title,
            record_type=request.data.get('record_type', 'OTHER'),
            file=request.FILES.get('file'),
            notes=request.data.get('notes', ''),
            record_date=request.data.get('record_date') or None,
        )
        return Response({'success': True, 'data': {'record': HealthRecordSerializer(record, context={'request': request}).data}}, status=status.HTTP_201_CREATED)


class HealthRecordDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            record = HealthRecord.objects.get(id=pk, user=request.user)
        except HealthRecord.DoesNotExist:
            return Response({'success': False, 'message': 'Record not found.'}, status=status.HTTP_404_NOT_FOUND)
        if record.file:
            record.file.delete(save=False)
        record.delete()
        return Response({'success': True, 'message': 'Record deleted.'})


# ─── Medicine Reminders ───────────────────────────────────────────────────────

class ReminderListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reminders = MedicineReminder.objects.filter(user=request.user).select_related('medicine')
        active = request.query_params.get('active')
        if active == 'true':
            reminders = reminders.filter(is_active=True)
        return Response({'success': True, 'data': {'reminders': MedicineReminderSerializer(reminders, many=True).data}})

    def post(self, request):
        s = MedicineReminderSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        medicine = None
        medicine_id = s.validated_data.get('medicine_id')
        medicine_name = s.validated_data.get('medicine_name', '').strip()
        if medicine_id:
            try:
                medicine = Medicine.objects.get(id=medicine_id)
            except Medicine.DoesNotExist:
                return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
            if not medicine_name:
                medicine_name = medicine.name
        if not medicine_name:
            return Response({'success': False, 'message': 'Medicine name is required.'}, status=status.HTTP_400_BAD_REQUEST)

        reminder = MedicineReminder.objects.create(
            user=request.user,
            medicine=medicine,
            medicine_name=medicine_name,
            dosage=s.validated_data.get('dosage'),
            times=s.validated_data['times'],
            frequency=s.validated_data.get('frequency', 'DAILY'),
            start_date=s.validated_data['start_date'],
            end_date=s.validated_data.get('end_date'),
            notes=s.validated_data.get('notes'),
        )
        return Response({'success': True, 'data': {'reminder': MedicineReminderSerializer(reminder).data}, 'message': 'Reminder created.'}, status=status.HTTP_201_CREATED)


class ReminderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            reminder = MedicineReminder.objects.get(id=pk, user=request.user)
        except MedicineReminder.DoesNotExist:
            return Response({'success': False, 'message': 'Reminder not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = MedicineReminderSerializer(reminder, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        for field in ['medicine_name', 'dosage', 'times', 'frequency', 'start_date', 'end_date', 'notes']:
            if field in s.validated_data:
                setattr(reminder, field, s.validated_data[field])
        if 'is_active' in request.data:
            reminder.is_active = bool(request.data['is_active'])
        reminder.save()
        return Response({'success': True, 'data': {'reminder': MedicineReminderSerializer(reminder).data}, 'message': 'Reminder updated.'})

    def delete(self, request, pk):
        try:
            reminder = MedicineReminder.objects.get(id=pk, user=request.user)
        except MedicineReminder.DoesNotExist:
            return Response({'success': False, 'message': 'Reminder not found.'}, status=status.HTTP_404_NOT_FOUND)
        reminder.delete()
        return Response({'success': True, 'message': 'Reminder deleted.'})


class ReminderMarkTakenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            reminder = MedicineReminder.objects.get(id=pk, user=request.user)
        except MedicineReminder.DoesNotExist:
            return Response({'success': False, 'message': 'Reminder not found.'}, status=status.HTTP_404_NOT_FOUND)

        scheduled_time = request.data.get('time', '').strip()
        if scheduled_time not in [t.strip() for t in reminder.times.split(',')]:
            return Response({'success': False, 'message': 'Invalid time for this reminder.'}, status=status.HTTP_400_BAD_REQUEST)
        scheduled_date = request.data.get('date') or timezone.now().date().isoformat()

        log, _ = ReminderLog.objects.get_or_create(
            reminder=reminder, scheduled_date=scheduled_date, scheduled_time=scheduled_time,
        )
        if log.taken_at:
            log.taken_at = None
        else:
            log.taken_at = timezone.now()
        log.save(update_fields=['taken_at'])
        return Response({'success': True, 'data': {'log': ReminderLogSerializer(log).data}})


def _reminder_due_today(reminder, today):
    """DAILY (and AS_NEEDED, which is available any day the customer wants to log a dose) show
    every day in range. WEEKLY only shows on the same weekday as start_date; MONTHLY only on the
    same day-of-month as start_date, clamped to the last day of shorter months (e.g. a reminder
    started on the 31st still fires on Feb 28th/29th)."""
    if reminder.frequency == 'WEEKLY':
        return reminder.start_date.weekday() == today.weekday()
    if reminder.frequency == 'MONTHLY':
        last_day_this_month = calendar.monthrange(today.year, today.month)[1]
        target_day = min(reminder.start_date.day, last_day_this_month)
        return today.day == target_day
    return True


class ReminderTodayView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        now = timezone.now()
        reminders = [
            r for r in MedicineReminder.objects.filter(
                user=request.user, is_active=True, start_date__lte=today,
            ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today))
            if _reminder_due_today(r, today)
        ]

        logs = {
            (log.reminder_id, log.scheduled_time): log
            for log in ReminderLog.objects.filter(reminder__in=reminders, scheduled_date=today)
        }

        schedule = []
        for r in reminders:
            for t in [t.strip() for t in r.times.split(',') if t.strip()]:
                log = logs.get((r.id, t))
                scheduled_dt = timezone.make_aware(datetime.combine(today, datetime.strptime(t, '%H:%M').time()))
                if log is None and now >= scheduled_dt:
                    # get_or_create + the (reminder, scheduled_date, scheduled_time) unique_together
                    # constraint is what guarantees this fires exactly once per due occurrence, same
                    # discipline as delivery_stale_notified_at elsewhere in this codebase — two
                    # concurrent polls racing here just means one of them gets created=False.
                    log, created = ReminderLog.objects.get_or_create(reminder=r, scheduled_date=today, scheduled_time=t)
                    if created or log.notified_at is None:
                        notify_user(
                            user=request.user, type='REMINDER_DUE', title='Medicine Reminder',
                            message=f'Time for {r.medicine_name}{f" ({r.dosage})" if r.dosage else ""} — scheduled for {t}.',
                            link='/reminders',
                        )
                        log.notified_at = timezone.now()
                        log.save(update_fields=['notified_at'])
                schedule.append({
                    'reminder_id': str(r.id),
                    'medicine_name': r.medicine_name,
                    'dosage': r.dosage,
                    'time': t,
                    'taken': bool(log and log.taken_at),
                })
        schedule.sort(key=lambda x: x['time'])
        return Response({'success': True, 'data': {'date': today.isoformat(), 'schedule': schedule}})


# ─── Notifications ────────────────────────────────────────────────────────────

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(user=request.user).order_by('-created_at')[:50]
        unread = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'success': True, 'data': {'notifications': NotificationSerializer(notifications, many=True).data, 'unread': unread}})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        Notification.objects.filter(id=pk, user=request.user).update(is_read=True)
        return Response({'success': True})

    def delete(self, request, pk):
        Notification.objects.filter(id=pk, user=request.user).delete()
        return Response({'success': True})


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'success': True})


class NotificationClearAllView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        Notification.objects.filter(user=request.user).delete()
        return Response({'success': True, 'message': 'All notifications cleared.'})


# ─── Admin ────────────────────────────────────────────────────────────────────

class AdminDashboardView(APIView):
    permission_classes = [require_permission('view_reports')]

    def get(self, request):
        total_orders = Order.objects.count()
        # Total revenue spans all three paid channels — medicine orders, lab-test bookings and
        # doctor appointments — not just Order, so a Khalti lab payment actually shows up here.
        order_revenue = Order.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        lab_revenue = LabTestBooking.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        appt_revenue = DoctorAppointment.objects.filter(payment_status='PAID').aggregate(s=Sum('fee_charged'))['s'] or 0
        total_revenue = order_revenue + lab_revenue + appt_revenue
        total_customers = User.objects.filter(role='CUSTOMER', is_deleted=False).count()
        total_medicines = Medicine.objects.count()
        pending_prescriptions = Prescription.objects.filter(status='PENDING').count()
        pending_doctor_profile_changes = DoctorProfileChangeRequest.objects.filter(status='PENDING').count()
        pending_orders = Order.objects.filter(status='PLACED').count()
        delivered_orders = Order.objects.filter(status='DELIVERED').count()
        cancelled_orders = Order.objects.filter(status='CANCELLED').count()
        low_stock_threshold = int(_get_setting('low_stock_threshold', '10'))
        low_stock_count = Medicine.objects.filter(stock_quantity__lte=low_stock_threshold, in_stock=True).count()
        recent_orders = Order.objects.select_related('user').prefetch_related(
            'fulfillments__pharmacy', 'fulfillments__delivery_agent__user',
            'fulfillments__order_items__medicine', 'fulfillments__order_items__prescription',
        ).order_by('-placed_at')[:6]
        recent = OrderSerializer(recent_orders, many=True).data
        # which pharmacy has each order and what stage it's at — Order.status alone doesn't show
        # this (see AdminOrderFulfillmentSerializer's docstring), and the dashboard is exactly
        # where admin needs it at a glance, not three clicks into the full Orders page.
        for order_data, order in zip(recent, recent_orders):
            order_data['fulfillments'] = AdminOrderFulfillmentSerializer(order.fulfillments.all(), many=True).data

        return Response({
            'success': True,
            'data': {
                'total_orders': total_orders,
                'total_revenue': float(total_revenue),
                'total_customers': total_customers,
                'total_medicines': total_medicines,
                'pending_prescriptions': pending_prescriptions,
                'pending_doctor_profile_changes': pending_doctor_profile_changes,
                'pending_orders': pending_orders,
                'delivered_orders': delivered_orders,
                'cancelled_orders': cancelled_orders,
                'low_stock_count': low_stock_count,
                'recent_orders': recent,
            },
        })


class AdminReportsView(APIView):
    permission_classes = [require_permission('view_reports')]

    def get(self, request):
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # NO_PHARMACY_FOUND orders never generated revenue or a real transaction — same reasoning
        # as excluding CANCELLED, everywhere except order_status_counts below, where it's exactly
        # the "how many orders failed to match a pharmacy" figure this status exists to surface.
        # AWAITING_PRESCRIPTION/PRESCRIPTION_REJECTED haven't reached pharmacies yet either — not
        # a sale (or a failure) until they're released or cancelled.
        FAILED_STATUSES = ['CANCELLED', 'NO_PHARMACY_FOUND', 'AWAITING_PRESCRIPTION', 'PRESCRIPTION_REJECTED']

        # Revenue spans all three paid channels. Orders bucket by placed_at; lab bookings and
        # appointments have no paid_at, so they bucket by booked_at (online payment ≈ booking time;
        # a COD lab amount only flips to PAID once the collector confirms it, so it's real revenue).
        order_revenue = Order.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        lab_test_revenue = LabTestBooking.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        appointment_revenue = DoctorAppointment.objects.filter(payment_status='PAID').aggregate(s=Sum('fee_charged'))['s'] or 0
        total_revenue = order_revenue + lab_test_revenue + appointment_revenue
        monthly_revenue = (
            (Order.objects.filter(payment_status='PAID', placed_at__gte=start_of_month).aggregate(s=Sum('total_amount'))['s'] or 0)
            + (LabTestBooking.objects.filter(payment_status='PAID', booked_at__gte=start_of_month).aggregate(s=Sum('total_amount'))['s'] or 0)
            + (DoctorAppointment.objects.filter(payment_status='PAID', booked_at__gte=start_of_month).aggregate(s=Sum('fee_charged'))['s'] or 0)
        )
        total_orders = Order.objects.exclude(status__in=FAILED_STATUSES).count()
        cancelled_count = Order.objects.filter(status='CANCELLED').count()
        total_customers = User.objects.filter(role='CUSTOMER', is_deleted=False).count()
        pending_prescriptions = Prescription.objects.filter(status='PENDING').count()

        order_status_counts = list(
            Order.objects.exclude(status='CANCELLED').values('status').annotate(count=Count('id')).order_by('-count')
        )
        # Payment-method mix across all three channels, so a Khalti/eSewa lab or appointment payment
        # is visible here — not just medicine orders. Non-cancelled records with a chosen method,
        # merged by method (Plus-free appointments have no method and are excluded).
        method_counts = {}
        for qs in (
            Order.objects.exclude(status='CANCELLED').exclude(payment_method__isnull=True).values('payment_method').annotate(count=Count('id')),
            LabTestBooking.objects.exclude(status='CANCELLED').exclude(payment_method__isnull=True).values('payment_method').annotate(count=Count('id')),
            DoctorAppointment.objects.exclude(status='CANCELLED').exclude(payment_method__isnull=True).values('payment_method').annotate(count=Count('id')),
        ):
            for row in qs:
                method_counts[row['payment_method']] = method_counts.get(row['payment_method'], 0) + row['count']
        payment_method_counts = [
            {'payment_method': k, 'count': v} for k, v in sorted(method_counts.items(), key=lambda kv: -kv[1])
        ]

        top_items = (
            OrderItem.objects.exclude(order__status__in=FAILED_STATUSES)
            .values('medicine_id', 'medicine__name', 'medicine__brand__name', 'medicine__price')
            .annotate(total_qty=Sum('quantity'))
            .order_by('-total_qty')[:8]
        )
        top_medicines = [
            {
                'medicine': {'id': str(t['medicine_id']), 'name': t['medicine__name'], 'brand': t['medicine__brand__name']},
                'total_qty': t['total_qty'],
                'revenue': float(t['total_qty'] * t['medicine__price']),
            }
            for t in top_items
        ]

        six_months_ago = (start_of_month - timedelta(days=150)).replace(day=1)
        recent_orders = Order.objects.exclude(status__in=FAILED_STATUSES).filter(placed_at__gte=six_months_ago).values('placed_at', 'total_amount', 'payment_status')
        monthly_map = {}
        for o in recent_orders:
            key = o['placed_at'].strftime('%Y-%m')
            entry = monthly_map.setdefault(key, {'month': key, 'orders': 0, 'revenue': 0.0})
            entry['orders'] += 1
            if o['payment_status'] == 'PAID':
                entry['revenue'] += float(o['total_amount'])
        # Fold paid lab bookings + appointments into the same monthly revenue buckets (by booked_at).
        # 'orders' stays a medicine-order count; only 'revenue' gains the services.
        for b in LabTestBooking.objects.filter(payment_status='PAID', booked_at__gte=six_months_ago).values('booked_at', 'total_amount'):
            key = b['booked_at'].strftime('%Y-%m')
            monthly_map.setdefault(key, {'month': key, 'orders': 0, 'revenue': 0.0})['revenue'] += float(b['total_amount'])
        for a in DoctorAppointment.objects.filter(payment_status='PAID', booked_at__gte=six_months_ago).values('booked_at', 'fee_charged'):
            key = a['booked_at'].strftime('%Y-%m')
            monthly_map.setdefault(key, {'month': key, 'orders': 0, 'revenue': 0.0})['revenue'] += float(a['fee_charged'])
        monthly_trend = [monthly_map[k] for k in sorted(monthly_map.keys())]

        return Response({
            'success': True,
            'data': {
                'total_revenue': float(total_revenue),
                'order_revenue': float(order_revenue),
                'lab_test_revenue': float(lab_test_revenue),
                'appointment_revenue': float(appointment_revenue),
                'monthly_revenue': float(monthly_revenue),
                'total_orders': total_orders,
                'cancelled_count': cancelled_count,
                'total_customers': total_customers,
                'pending_prescriptions': pending_prescriptions,
                'order_status_counts': order_status_counts,
                'payment_method_counts': payment_method_counts,
                'top_medicines': top_medicines,
                'monthly_trend': monthly_trend,
            },
        })


class AdminCategoryListView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request):
        categories = Category.objects.annotate(medicine_count=Count('medicines')).order_by('name')
        data = CategorySerializer(categories, many=True).data
        for i, cat in enumerate(categories):
            data[i]['medicine_count'] = cat.medicine_count
        return Response({'success': True, 'data': {'categories': data}})

    def post(self, request):
        s = CategorySerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        category = s.save()
        return Response({'success': True, 'data': {'category': CategorySerializer(category).data}}, status=status.HTTP_201_CREATED)


class AdminCategoryDetailView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request, pk):
        try:
            category = Category.objects.get(id=pk)
        except Category.DoesNotExist:
            return Response({'success': False, 'message': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'category': CategorySerializer(category).data}})

    def put(self, request, pk):
        try:
            category = Category.objects.get(id=pk)
        except Category.DoesNotExist:
            return Response({'success': False, 'message': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = CategorySerializer(category, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'category': s.data}})

    def delete(self, request, pk):
        try:
            category = Category.objects.get(id=pk)
        except Category.DoesNotExist:
            return Response({'success': False, 'message': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)
        if category.medicines.exists():
            return Response({'success': False, 'message': 'Cannot delete category with medicines.'}, status=status.HTTP_400_BAD_REQUEST)
        category.delete()
        return Response({'success': True, 'message': 'Category deleted.'})


class AdminBrandListView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request):
        brands = Brand.objects.annotate(medicine_count=Count('medicines')).order_by('name')
        data = BrandSerializer(brands, many=True).data
        for i, b in enumerate(brands):
            data[i]['medicine_count'] = b.medicine_count
        return Response({'success': True, 'data': {'brands': data}})

    def post(self, request):
        s = BrandSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        brand = s.save()
        return Response({'success': True, 'data': {'brand': BrandSerializer(brand).data}}, status=status.HTTP_201_CREATED)


class AdminBrandDetailView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request, pk):
        try:
            brand = Brand.objects.get(id=pk)
        except Brand.DoesNotExist:
            return Response({'success': False, 'message': 'Brand not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'brand': BrandSerializer(brand).data}})

    def put(self, request, pk):
        try:
            brand = Brand.objects.get(id=pk)
        except Brand.DoesNotExist:
            return Response({'success': False, 'message': 'Brand not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = BrandSerializer(brand, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'brand': s.data}})

    def delete(self, request, pk):
        try:
            brand = Brand.objects.get(id=pk)
        except Brand.DoesNotExist:
            return Response({'success': False, 'message': 'Brand not found.'}, status=status.HTTP_404_NOT_FOUND)
        if brand.medicines.exists():
            return Response({'success': False, 'message': 'Cannot delete brand with medicines.'}, status=status.HTTP_400_BAD_REQUEST)
        brand.delete()
        return Response({'success': True, 'message': 'Brand deleted.'})


class AdminMedicineListView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request):
        qs = Medicine.objects.select_related('category', 'brand').order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__name__icontains=search))
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        medicines = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'medicines': MedicineDetailSerializer(medicines, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })

    def post(self, request):
        s = MedicineDetailSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        medicine = s.save()
        return Response({'success': True, 'data': {'medicine': MedicineDetailSerializer(medicine).data}}, status=status.HTTP_201_CREATED)


class AdminMedicineDetailView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request, pk):
        try:
            medicine = Medicine.objects.select_related('category', 'brand').get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'medicine': MedicineDetailSerializer(medicine).data}})

    def put(self, request, pk):
        try:
            medicine = Medicine.objects.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = MedicineDetailSerializer(medicine, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'medicine': s.data}})

    def delete(self, request, pk):
        try:
            medicine = Medicine.objects.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        medicine.delete()
        return Response({'success': True, 'message': 'Medicine deleted.'})


class AdminMedicineImageUploadView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def post(self, request):
        from django.core.files.storage import FileSystemStorage

        file = request.FILES.get('image')
        if not file:
            return Response({'success': False, 'message': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or GIF images are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 5 * 1024 * 1024:
            return Response({'success': False, 'message': 'Image must be under 5MB.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower() or '.jpg'
        filename = f'medicine_{uuid_lib.uuid4().hex}{ext}'
        storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'medicines'))
        storage.save(filename, file)

        return Response({'success': True, 'data': {'image_url': f'/media/medicines/{filename}'}})


class AdminLabTestCategoryListView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request):
        categories = LabTestCategory.objects.annotate(test_count=Count('lab_tests')).order_by('name')
        data = LabTestCategorySerializer(categories, many=True).data
        for i, c in enumerate(categories):
            data[i]['test_count'] = c.test_count
        return Response({'success': True, 'data': {'categories': data}})

    def post(self, request):
        s = LabTestCategorySerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        category = s.save()
        return Response({'success': True, 'data': {'category': LabTestCategorySerializer(category).data}}, status=status.HTTP_201_CREATED)


class AdminLabTestCategoryDetailView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def put(self, request, pk):
        try:
            category = LabTestCategory.objects.get(id=pk)
        except LabTestCategory.DoesNotExist:
            return Response({'success': False, 'message': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = LabTestCategorySerializer(category, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'category': s.data}})

    def delete(self, request, pk):
        try:
            category = LabTestCategory.objects.get(id=pk)
        except LabTestCategory.DoesNotExist:
            return Response({'success': False, 'message': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)
        if category.lab_tests.exists():
            return Response({'success': False, 'message': 'Cannot delete category with lab tests.'}, status=status.HTTP_400_BAD_REQUEST)
        category.delete()
        return Response({'success': True, 'message': 'Category deleted.'})


class AdminLabTestListView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request):
        qs = LabTest.objects.select_related('category').prefetch_related('included_tests__category').order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        tests = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'labTests': LabTestDetailSerializer(tests, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })

    def post(self, request):
        s = LabTestDetailSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        test = s.save()
        return Response({'success': True, 'data': {'labTest': LabTestDetailSerializer(test).data}}, status=status.HTTP_201_CREATED)


class AdminLabTestDetailView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request, pk):
        try:
            test = LabTest.objects.select_related('category').prefetch_related('included_tests__category').get(id=pk)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'labTest': LabTestDetailSerializer(test).data}})

    def put(self, request, pk):
        try:
            test = LabTest.objects.get(id=pk)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = LabTestDetailSerializer(test, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'labTest': s.data}})

    def delete(self, request, pk):
        try:
            test = LabTest.objects.get(id=pk)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        test.delete()
        return Response({'success': True, 'message': 'Lab test deleted.'})


# --- Bulk spreadsheet import/export (medicines, brands, categories, lab-tests) -------------------
# One set of generic views drives all four entities; the entity is a URL segment and the required
# permission (manage_inventory vs manage_lab_tests) is chosen per-entity from the import spec.

class _BulkBase(APIView):
    def get_permissions(self):
        spec = bulk_imports.get_spec(self.kwargs.get('entity'))
        # Unknown entity falls through to an inventory-permitted admin, who then gets a clean 404.
        code = spec['permission'] if spec else 'manage_inventory'
        return [require_permission(code)()]

    def _spec(self, entity):
        return bulk_imports.get_spec(entity)

    def _xlsx(self, content, filename):
        resp = HttpResponse(content, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        resp['Content-Disposition'] = f'attachment; filename="{filename}"'
        return resp


class AdminBulkTemplateView(_BulkBase):
    def get(self, request, entity):
        spec = self._spec(entity)
        if not spec:
            return Response({'success': False, 'message': 'Unknown data type.'}, status=status.HTTP_404_NOT_FOUND)
        return self._xlsx(bulk_imports.template_workbook(spec), f'{entity}-import-template.xlsx')


class AdminBulkExportView(_BulkBase):
    def get(self, request, entity):
        spec = self._spec(entity)
        if not spec:
            return Response({'success': False, 'message': 'Unknown data type.'}, status=status.HTTP_404_NOT_FOUND)
        return self._xlsx(bulk_imports.export_workbook(spec), f'{entity}-export.xlsx')


class AdminBulkImportPreviewView(_BulkBase):
    def post(self, request, entity):
        spec = self._spec(entity)
        if not spec:
            return Response({'success': False, 'message': 'Unknown data type.'}, status=status.HTTP_404_NOT_FOUND)
        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed = bulk_imports.parse_file(spec, file, file.name)
        except Exception:
            return Response({'success': False, 'message': 'Could not read that file. Upload a .xlsx or .csv exported from this template.'}, status=status.HTTP_400_BAD_REQUEST)
        if not parsed:
            return Response({'success': False, 'message': 'The file has no data rows.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'data': bulk_imports.build_plan(spec, parsed)})


class AdminBulkImportCommitView(_BulkBase):
    def post(self, request, entity):
        spec = self._spec(entity)
        if not spec:
            return Response({'success': False, 'message': 'Unknown data type.'}, status=status.HTTP_404_NOT_FOUND)
        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            apply_rows = json.loads(request.data.get('apply_rows') or '[]')
            create_refs = json.loads(request.data.get('create_refs') or '{}')
        except (ValueError, TypeError):
            return Response({'success': False, 'message': 'Invalid import selection.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parsed = bulk_imports.parse_file(spec, file, file.name)
        except Exception:
            return Response({'success': False, 'message': 'Could not read that file.'}, status=status.HTTP_400_BAD_REQUEST)
        summary = bulk_imports.apply_import(spec, parsed, apply_rows, create_refs)
        return Response({'success': True, 'data': summary})


class AdminLabTestBookingListView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request):
        qs = LabTestBooking.objects.select_related('user', 'lab_test', 'address', 'collector__user').order_by('-booked_at')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        collector_filter = request.query_params.get('collector', '').strip()
        if collector_filter:
            # LabCollector id — lets an admin pull up one collector's full booking history/workload.
            qs = qs.filter(collector_id=collector_filter)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(user__full_name__icontains=search) | Q(user__email__icontains=search) | Q(lab_test__name__icontains=search))
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        bookings = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'bookings': LabTestBookingSerializer(bookings, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminLabTestBookingDetailView(APIView):
    """Free-form admin override — kept for genuine edge cases (e.g. manually cancelling a stuck
    booking), but the collector-driven statuses (EN_ROUTE, ARRIVED, SAMPLE_COLLECTED,
    SUBMITTED_TO_LAB, REPORT_READY) are deliberately excluded from what this can set directly: each
    has a dedicated gated action (the collector_mark_* / collector_confirm_sample_collected() /
    _upload_lab_report() transitions) that enforces real prerequisites — an assigned collector
    physically progressing the job, confirming a COD amount, an actual file being attached — this
    endpoint has no business faking. The normal path for those transitions is the dedicated actions,
    not this one; admin free-form is limited to PENDING / CONFIRMED / CANCELLED."""
    permission_classes = [require_permission('manage_lab_tests')]

    def put(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(id=pk)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status and new_status not in dict(LabTestBooking.STATUS):
            return Response({'success': False, 'message': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status in ('EN_ROUTE', 'ARRIVED', 'SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB', 'REPORT_READY'):
            return Response({'success': False, 'message': f'{new_status.replace("_", " ").title()} can only be set through its dedicated action, not this general update.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status:
            booking.status = new_status
        if 'report_url' in request.data:
            booking.report_url = request.data.get('report_url') or None
        booking.save()
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Booking updated.'})


class AdminLabTestBookingAssignCollectorView(APIView):
    """The only path a booking ever gets a collector — admin picks one explicitly. is_verified is
    the only gate: verification is where "this person can actually do this job" gets decided, by
    admin, once, at onboarding (see AdminLabCollectorListView.post()), not re-litigated per
    booking. Reassignment is allowed — overwriting an existing collector — for the real-world case
    of a collector becoming unavailable after being assigned."""
    permission_classes = [require_permission('manage_lab_tests')]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(id=pk)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        collector_id = request.data.get('collector_id')
        if not collector_id:
            return Response({'success': False, 'message': 'collector_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            collector = LabCollector.objects.get(id=collector_id)
        except LabCollector.DoesNotExist:
            return Response({'success': False, 'message': 'Collector not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if not collector.is_verified:
            return Response({'success': False, 'message': 'This collector is not verified yet.'}, status=status.HTTP_400_BAD_REQUEST)

        previous = booking.collector  # capture before overwrite so a reassignment can notify the old collector
        booking.collector = collector
        booking.save(update_fields=['collector'])

        date_label = booking.scheduled_date.strftime('%b %d, %Y')
        addr = booking.address
        address_label = f'{addr.address}, {addr.city}' if addr else 'the address on file'
        notify_user(
            collector.user, 'COLLECTION_ASSIGNED', 'New Collection Assigned',
            f'{booking.lab_test.name} for {booking.user.full_name} on {date_label}, {booking.time_slot} — {address_label}.',
            link='/lab-collector/active',
        )
        if previous and previous.id != collector.id:
            notify_user(
                previous.user, 'COLLECTION_ASSIGNED', 'Collection Reassigned',
                f'{booking.lab_test.name} for {booking.user.full_name} on {date_label} has been reassigned to another collector and is no longer in your queue.',
                link='/lab-collector/active',
            )
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': f'{collector.user.full_name} assigned to this booking.'})


class AdminLabTestReportUploadView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(id=pk)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'A report file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, err = _upload_lab_report(booking, file)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Report uploaded.'})


class AdminBlogPostListView(APIView):
    permission_classes = [require_permission('manage_blog')]

    def get(self, request):
        qs = BlogPost.objects.all()
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(title__icontains=search)
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        posts = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'posts': BlogPostDetailSerializer(posts, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })

    def post(self, request):
        s = BlogPostDetailSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        post = s.save()
        return Response({'success': True, 'data': {'post': BlogPostDetailSerializer(post).data}}, status=status.HTTP_201_CREATED)


class AdminBlogPostDetailView(APIView):
    permission_classes = [require_permission('manage_blog')]

    def get(self, request, pk):
        try:
            post = BlogPost.objects.get(id=pk)
        except BlogPost.DoesNotExist:
            return Response({'success': False, 'message': 'Article not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'post': BlogPostDetailSerializer(post).data}})

    def put(self, request, pk):
        try:
            post = BlogPost.objects.get(id=pk)
        except BlogPost.DoesNotExist:
            return Response({'success': False, 'message': 'Article not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = BlogPostDetailSerializer(post, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'post': s.data}})

    def delete(self, request, pk):
        try:
            post = BlogPost.objects.get(id=pk)
        except BlogPost.DoesNotExist:
            return Response({'success': False, 'message': 'Article not found.'}, status=status.HTTP_404_NOT_FOUND)
        post.delete()
        return Response({'success': True, 'message': 'Article deleted.'})


class AdminSubscriptionListView(APIView):
    permission_classes = [require_permission('manage_subscriptions')]

    def get(self, request):
        qs = MedicineSubscription.objects.select_related('user', 'medicine', 'address').order_by('next_delivery_date')
        due_only = request.query_params.get('due', '').strip()
        if due_only == 'true':
            qs = qs.filter(is_active=True, next_delivery_date__lte=timezone.now().date())
        active = request.query_params.get('active', '').strip()
        if active == 'true':
            qs = qs.filter(is_active=True)
        elif active == 'false':
            qs = qs.filter(is_active=False)
        return Response({'success': True, 'data': {'subscriptions': MedicineSubscriptionSerializer(qs, many=True).data}})


class AdminSubscriptionRenewView(APIView):
    permission_classes = [require_permission('manage_subscriptions')]

    def post(self, request, pk):
        try:
            sub = MedicineSubscription.objects.select_related('medicine', 'address', 'user').get(id=pk)
        except MedicineSubscription.DoesNotExist:
            return Response({'success': False, 'message': 'Subscription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not sub.is_active:
            return Response({'success': False, 'message': 'This subscription is paused.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            item_total = sub.medicine.price * sub.quantity
            free_threshold = Decimal(_get_setting('free_delivery_threshold', '500'))
            delivery_charge_setting = Decimal(_get_setting('delivery_charge', '50'))
            delivery = Decimal('0') if (item_total >= free_threshold or _has_active_plus(sub.user)) else delivery_charge_setting

            order = Order.objects.create(
                user=sub.user,
                address=sub.address,
                total_amount=item_total + delivery,
                delivery_charge=delivery,
                payment_method='COD',
                payment_status='PENDING',
                status='PLACED',
                notes=f'Auto-refill renewal of subscription {sub.id}',
            )
            OrderItem.objects.create(order=order, medicine=sub.medicine, quantity=sub.quantity, unit_price=sub.medicine.price)

            sub.last_delivered_at = timezone.now()
            sub.next_delivery_date = timezone.now().date() + timedelta(days=sub.frequency_days)
            sub.save(update_fields=['last_delivered_at', 'next_delivery_date'])

        return Response({
            'success': True,
            'data': {'order': OrderSerializer(order).data, 'subscription': MedicineSubscriptionSerializer(sub).data},
            'message': 'Renewal order created.',
        }, status=status.HTTP_201_CREATED)


class AdminExpireFulfillmentRequestsView(APIView):
    """Cron/admin-callable sweep for both the pharmacy broadcast window (Stage 2) and the delivery
    broadcast window (Stage 4) — same manual-trigger pattern as AdminSubscriptionRenewView until
    real task infrastructure exists. Expires stale PENDING FulfillmentRequests and reports which
    OrderItems ended up with no acceptance in time, plus which OrderFulfillments have gone too
    long since being broadcast with no rider accepting (reported only — see
    expire_stale_delivery_broadcasts()'s docstring for why there's nothing to flip there)."""
    permission_classes = [require_permission('manage_pharmacies')]

    def post(self, request):
        expired_count, unfulfillable_item_ids = expire_stale_fulfillment_requests()
        stale_delivery_fulfillment_ids = expire_stale_delivery_broadcasts()
        return Response({
            'success': True,
            'data': {
                'expired_requests': expired_count,
                'unfulfillable_item_ids': [str(i) for i in unfulfillable_item_ids],
                'stale_delivery_fulfillment_ids': [str(i) for i in stale_delivery_fulfillment_ids],
            },
            'message': f'Expired {expired_count} stale fulfillment request(s); {len(stale_delivery_fulfillment_ids)} delivery broadcast(s) still stale.',
        })


class AdminDoctorListView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request):
        doctors = Doctor.objects.select_related('user').order_by('name')
        return Response({'success': True, 'data': {'doctors': AdminDoctorSerializer(doctors, many=True).data}})

    def post(self, request):
        s = AdminDoctorCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['name'], phone=d['phone'], password=d['password'],
                role='DOCTOR', is_active=True, is_email_verified=True,
            )
            doctor = Doctor.objects.create(
                user=user, name=d['name'], specialty=d['specialty'], qualification=d.get('qualification', ''),
                experience_years=d.get('experience_years', 0), consultation_fee=d['consultation_fee'],
                photo_url=d.get('photo_url', ''), bio=d.get('bio', ''), languages=d.get('languages', ''),
                license_number=d['license_number'], onboarding_fee_amount=d.get('onboarding_fee_amount', Decimal('0')),
            )

        # Mirrors the pharmacy and collector creation paths: a persistent in-app row that never
        # carries the password, plus the welcome email that does. Both run post-commit so we never
        # announce an account a rollback undid. Without these the doctor was simply never told the
        # account existed — admin typed a password and nothing ever reached them.
        Notification.objects.create(
            user=user, type='ACCOUNT_UPDATE', title='Your doctor account is ready',
            message='You can now sign in to set your availability and complete your profile. '
                    'Our team will verify your account before you can accept consultations.',
            link='/doctor/dashboard',
        )
        send_doctor_welcome_email(user, d['password'], doctor_name=doctor.name)

        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Doctor account created — remember to verify it before it can accept appointments.'}, status=status.HTTP_201_CREATED)


class AdminDoctorDetailView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.select_related('user').prefetch_related('profile_change_requests', 'documents').get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        ctx = {'request': request}
        return Response({'success': True, 'data': {
            'doctor': AdminDoctorSerializer(doctor).data,
            'profile_change_requests': DoctorProfileChangeRequestSerializer(doctor.profile_change_requests.all(), many=True, context=ctx).data,
            'documents': DoctorDocumentSerializer(doctor.documents.all(), many=True, context=ctx).data,
        }})

    def put(self, request, pk):
        # Kept for the existing Edit Doctor admin page (plain field edits only, no verify/suspend).
        # patch() below is the fuller admin-management surface added in Stage 2.
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = DoctorSerializer(doctor, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'doctor': s.data}})

    def patch(self, request, pk):
        try:
            doctor = Doctor.objects.select_related('user').get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('name', 'specialty', 'qualification', 'experience_years', 'consultation_fee', 'photo_url', 'bio', 'languages', 'is_active'):
            if field in request.data:
                setattr(doctor, field, request.data[field])
        if 'is_verified' in request.data:
            doctor.is_verified = bool(request.data['is_verified'])
        doctor.save()

        # Admin's suspension switch — separate from is_active (bookability). Only meaningful once
        # the doctor has a linked login account; the 8 legacy rows don't yet (see link-account/).
        if 'user_is_active' in request.data:
            if not doctor.user_id:
                return Response({'success': False, 'message': 'This doctor has no login account yet — link one first.'}, status=status.HTTP_400_BAD_REQUEST)
            doctor.user.is_active = bool(request.data['user_is_active'])
            doctor.user.save(update_fields=['is_active'])

        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Doctor updated.'})

    def delete(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        if doctor.appointments.exists():
            return Response({'success': False, 'message': 'Cannot delete a doctor with appointments.'}, status=status.HTTP_400_BAD_REQUEST)
        doctor.delete()
        return Response({'success': True, 'message': 'Doctor removed.'})


class AdminDoctorMarkOnboardingPaidView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        if doctor.onboarding_fee_paid:
            return Response({'success': False, 'message': 'Onboarding fee is already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        doctor.onboarding_fee_paid = True
        doctor.onboarding_fee_paid_at = timezone.now()
        doctor.save(update_fields=['onboarding_fee_paid', 'onboarding_fee_paid_at'])
        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Onboarding fee marked as paid.'})


class AdminDoctorLinkAccountView(APIView):
    """For the 8 legacy Doctor rows with no User — a one-time action, not reassignment; rejects
    outright if a login is already linked rather than allowing it to be overwritten."""
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        if doctor.user_id:
            return Response({'success': False, 'message': 'This doctor already has a linked login account.'}, status=status.HTTP_400_BAD_REQUEST)

        s = AdminDoctorLinkAccountSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['full_name'], phone=d['phone'], password=d['password'],
                role='DOCTOR', is_active=True, is_email_verified=True,
            )
            doctor.user = user
            doctor.save(update_fields=['user'])

        # Same post-commit pair as AdminDoctorListView.post — a legacy doctor getting their first
        # login needs to be told about it just as much as a freshly created one.
        Notification.objects.create(
            user=user, type='ACCOUNT_UPDATE', title='Your doctor account is ready',
            message='You can now sign in to set your availability and complete your profile.',
            link='/doctor/dashboard',
        )
        send_doctor_welcome_email(user, d['password'], doctor_name=doctor.name)

        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Login account linked.'}, status=status.HTTP_201_CREATED)


class AdminAppointmentListView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request):
        qs = (
            DoctorAppointment.objects
            .select_related('user', 'doctor', 'payout')
            .prefetch_related(*APPOINTMENT_PRESCRIPTION_PREFETCH)
            .order_by('-booked_at')
        )
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        data = DoctorAppointmentSerializer(qs, many=True, context={'request': request}).data
        for row, appt in zip(data, qs):
            row['payout_status'] = appt.payout.status if hasattr(appt, 'payout') else None
        return Response({'success': True, 'data': {'appointments': data}})


class AdminAppointmentDetailView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def put(self, request, pk):
        try:
            appt = DoctorAppointment.objects.select_related('doctor', 'payout').get(id=pk)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status and new_status not in dict(DoctorAppointment.STATUS):
            return Response({'success': False, 'message': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status:
            appt.status = new_status
        if 'meeting_link' in request.data:
            appt.meeting_link = request.data.get('meeting_link') or None
        appt.save()
        # A confirmed appointment should always have a room to join, so backfill one if this
        # update left it without a link — mirrors the doctor/auto-confirm paths. An explicit
        # non-empty meeting_link in the same request is preserved (the helper only fills a blank).
        if appt.status == 'CONFIRMED':
            _ensure_meeting_link(appt)
        data = DoctorAppointmentSerializer(appt, context={'request': request}).data
        data['payout_status'] = appt.payout.status if hasattr(appt, 'payout') else None
        return Response({'success': True, 'data': {'appointment': data}, 'message': 'Appointment updated.'})


class AdminDoctorPayoutListView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        payouts = doctor.payouts.select_related('appointment__user', 'paid_by').order_by('-created_at')
        return Response({'success': True, 'data': {'payouts': AdminDoctorPayoutSerializer(payouts, many=True).data}})


class AdminDoctorPayoutMarkPaidView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk, payout_id):
        try:
            payout = DoctorPayout.objects.get(pk=payout_id, doctor_id=pk)
        except DoctorPayout.DoesNotExist:
            return Response({'success': False, 'message': 'Payout not found.'}, status=status.HTTP_404_NOT_FOUND)
        if payout.status == 'PAID':
            return Response({'success': False, 'message': 'This payout is already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        payout.status = 'PAID'
        payout.paid_at = timezone.now()
        payout.paid_by = request.user
        payout.save(update_fields=['status', 'paid_at', 'paid_by'])
        return Response({'success': True, 'data': {'payout': AdminDoctorPayoutSerializer(payout).data}, 'message': 'Marked as paid.'})


class AdminOrderListView(APIView):
    permission_classes = [require_permission('manage_orders')]

    def get(self, request):
        qs = Order.objects.select_related('user').prefetch_related(
            'items__medicine__category', 'items__medicine__brand', 'items__prescription',
            'fulfillments__pharmacy', 'fulfillments__delivery_agent__user',
            'fulfillments__order_items__medicine', 'fulfillments__order_items__prescription',
            'items__fulfillment_requests__pharmacy', 'items__fulfillment_requests__order_item__medicine',
        ).order_by('-placed_at')
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(id__icontains=search) | Q(user__full_name__icontains=search) | Q(user__email__icontains=search))
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        orders = qs[(page - 1) * limit: page * limit]
        # attach each order's fulfillment-leg progress — Order.status alone doesn't distinguish
        # "pharmacy packing it" from "with the rider", only the fulfillments do (see
        # AdminOrderFulfillmentSerializer's docstring) — and separately, every pharmacy the order's
        # items were offered to and how each responded, which is what lets admin see who declined
        # or silently ignored a request even when nothing was ever accepted (NO_PHARMACY_FOUND).
        orders_data = OrderSerializer(orders, many=True).data
        for order_data, order in zip(orders_data, orders):
            order_data['fulfillments'] = AdminOrderFulfillmentSerializer(order.fulfillments.all(), many=True).data
            requests = [r for item in order.items.all() for r in item.fulfillment_requests.all()]
            order_data['fulfillment_requests'] = AdminFulfillmentRequestSerializer(requests, many=True).data
        return Response({
            'success': True,
            'data': {
                'orders': orders_data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminOrderDetailView(APIView):
    permission_classes = [require_permission('manage_orders')]

    def get(self, request, pk):
        try:
            order = Order.objects.select_related('user', 'address', 'prescription').prefetch_related(
                'items__medicine', 'items__prescription', 'fulfillments__pharmacy', 'fulfillments__delivery_agent__user',
                'fulfillments__order_items__medicine', 'fulfillments__order_items__prescription',
            ).get(id=pk)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = OrderSerializer(order).data
        data['customer'] = UserProfileSerializer(order.user).data
        data['fulfillments'] = AdminOrderFulfillmentSerializer(order.fulfillments.all(), many=True).data
        requests = FulfillmentRequest.objects.filter(order_item__order=order).select_related(
            'pharmacy', 'order_item__medicine',
        ).order_by('-created_at')
        data['fulfillment_requests'] = AdminFulfillmentRequestSerializer(requests, many=True).data
        return Response({'success': True, 'data': {'order': data}})

    def put(self, request, pk):
        try:
            order = Order.objects.get(id=pk)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status:
            order.status = new_status
        payment_status = request.data.get('payment_status')
        if payment_status:
            order.payment_status = payment_status
        order.save()
        notify_user(
            user=order.user,
            type='ORDER',
            title='Order Updated',
            message=f'Your order #{str(order.id)[:8]} status changed to {order.status}.',
            link=f'/orders/{order.id}',
        )
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}})

    def delete(self, request, pk):
        # Restricted to CANCELLED only — every other status is either still in play (BROADCASTING
        # through OUT_FOR_DELIVERY) or a completed transaction (DELIVERED/RETURNED) worth keeping
        # for records. A cancelled order never reached DELIVERED, so it never generated a
        # PharmacyPayout/DeliveryAgentEarning/DeliveryAgentCodLiability row (those are only created
        # in _create_settlement_records() on the PLACED -> DELIVERED transition) — those FKs are
        # on_delete=PROTECT, so the ProtectedError catch below is a defensive backstop, not the
        # expected path.
        try:
            order = Order.objects.get(id=pk)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status != 'CANCELLED':
            return Response({'success': False, 'message': 'Only cancelled orders can be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order.delete()
        except ProtectedError:
            return Response({'success': False, 'message': 'This order has related financial records and cannot be deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Order deleted.'})


class AdminOrderTrackingView(APIView):
    """Admin's on-demand lookup — no ownership scoping (any order), and deliberately no push
    notification counterpart per pharmax-rider-tracking-spec.md: an admin pulls this up for one
    order at a time rather than being notified for every delivery across the whole platform."""
    permission_classes = [require_permission('manage_orders')]

    def get(self, request, pk):
        try:
            order = Order.objects.get(id=pk)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        fulfillments = order.fulfillments.select_related('pharmacy', 'delivery_agent__user', 'order__address').prefetch_related('order_items__medicine', 'order_items__prescription')
        return Response({'success': True, 'data': {'fulfillments': [_tracking_payload(f) for f in fulfillments]}})


class AdminPrescriptionListView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def get(self, request):
        qs = Prescription.objects.select_related('user').prefetch_related('extra_files').filter(_prescription_visibility_filter()).distinct().order_by('-uploaded_at')
        # No status param at all means the frontend's "ALL" tab — genuinely no filter, not a
        # hidden default to PENDING (which silently broke "ALL" whenever nothing was pending).
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        prescriptions = qs[(page - 1) * limit: page * limit]
        data = PrescriptionSerializer(prescriptions, many=True).data
        for i, p in enumerate(prescriptions):
            data[i]['customer'] = {'id': str(p.user.id), 'full_name': p.user.full_name, 'email': p.user.email}
        return Response({
            'success': True,
            'data': {
                'prescriptions': data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


def _notify_prescription_order_outcome(prescription, new_status):
    """Tells the customer what a verify/reject means for any order(s) that reference this exact
    prescription. Searching for a pharmacy (and even a pharmacy accepting) already happened at
    checkout time regardless of prescription status — this doesn't touch Order.status or
    broadcasting at all. What actually depends on this is pharmacy_advance_fulfillment(), which
    refuses to let a pharmacy move an item past ACCEPTED (i.e. start really preparing it) while
    any of its Rx items lack a VERIFIED prescription."""
    order_ids = set(prescription.order_items.values_list('order_id', flat=True))
    order_ids |= set(prescription.orders.values_list('id', flat=True))
    if not order_ids:
        return
    for order in Order.objects.filter(id__in=order_ids).prefetch_related('items__medicine', 'items__prescription'):
        short_id = str(order.id)[:8].upper()
        if new_status == 'VERIFIED':
            # Only notify once every Rx item on the order is clear — a multi-prescription order
            # shouldn't get one "verified" ping per item while others are still pending review.
            # is_rx_cleared honours both admin's global verify and any pharmacy's own slice verify.
            still_needs_review = not all(item.is_rx_cleared for item in order.items.all())
            if still_needs_review:
                continue
            # If payment already cleared while this was still pending, the rider broadcast at
            # AWAITING_PAYMENT -> PLACED would have skipped every fulfillment on this order (see
            # _fulfillment_prescription_ready() there) — fire it now instead of leaving the rider
            # dispatch to wait for the pharmacy to manually reach AWAITING_DELIVERY.
            if order.status == 'PLACED':
                for fulfillment in order.fulfillments.exclude(status='CANCELLED'):
                    if fulfillment.delivery_broadcast_at is None and _fulfillment_prescription_ready(fulfillment):
                        broadcast_delivery(fulfillment)
            notify_user(
                user=order.user, type='ORDER', title='Prescription Verified',
                message=f'Your prescription was verified — order #{short_id} can now be prepared by the pharmacy.',
                link=f'/orders/{order.id}',
            )
        else:
            notify_user(
                user=order.user, type='ORDER', title='Prescription Rejected',
                message=f'A prescription for order #{short_id} was rejected. Please upload a new one so the pharmacy can prepare it.',
                link=f'/orders/{order.id}',
            )


class AdminPrescriptionDetailView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def get(self, request, pk):
        try:
            prescription = Prescription.objects.select_related('user').get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = PrescriptionSerializer(prescription).data
        data['customer'] = {'id': str(prescription.user.id), 'full_name': prescription.user.full_name, 'email': prescription.user.email}
        items = prescription.medicine_items.select_related('medicine__category', 'medicine__brand').order_by('created_at')
        data['medicine_items'] = PrescriptionMedicineItemSerializer(items, many=True).data
        lab_items = prescription.lab_test_items.select_related('lab_test__category', 'booking').order_by('created_at')
        data['lab_test_items'] = PrescriptionLabTestItemSerializer(lab_items, many=True).data
        return Response({'success': True, 'data': {'prescription': data}})

    def put(self, request, pk):
        try:
            prescription = Prescription.objects.select_related('user').get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        rejection_reason = request.data.get('rejection_reason', '')
        admin_comment = (request.data.get('admin_comment') or '').strip()
        if new_status not in ('VERIFIED', 'REJECTED'):
            return Response({'success': False, 'message': 'Status must be VERIFIED or REJECTED.'}, status=status.HTTP_400_BAD_REQUEST)
        prescription.status = new_status
        prescription.rejection_reason = rejection_reason if new_status == 'REJECTED' else ''
        prescription.admin_comment = admin_comment
        prescription.save(update_fields=['status', 'rejection_reason', 'admin_comment'])

        # A verified prescription can now carry lab tests as well as medicines, and they land the
        # patient in different places — a medicine goes to the cart, a test has to be booked with
        # its own address/date/time — so the nudge names whichever is actually there.
        medicine_count = prescription.medicine_items.count() if new_status == 'VERIFIED' else 0
        lab_test_count = prescription.lab_test_items.count() if new_status == 'VERIFIED' else 0
        if medicine_count and lab_test_count:
            message = (f'Your prescription has been verified — we found {medicine_count} medicine(s) '
                       f'and {lab_test_count} lab test(s). Review and act on them.')
            link = f'/prescriptions/{prescription.id}/review'
        elif medicine_count:
            message = f'Your prescription has been verified — we found {medicine_count} medicine(s). Review and add them to your cart.'
            link = f'/prescriptions/{prescription.id}/review'
        elif lab_test_count:
            message = f'Your prescription has been verified — we found {lab_test_count} lab test(s). Review and book them whenever suits you.'
            link = f'/prescriptions/{prescription.id}/review'
        else:
            message = f'Your prescription has been {new_status.lower()}.' + (f' Reason: {rejection_reason}' if rejection_reason else '')
            link = None
        if admin_comment:
            message += f' Note from pharmacist: {admin_comment}'
        notify_user(
            user=prescription.user,
            type='PRESCRIPTION',
            title='Prescription ' + new_status.capitalize(),
            message=message,
            link=link,
        )

        _notify_prescription_order_outcome(prescription, new_status)

        return Response({'success': True, 'data': {'prescription': PrescriptionSerializer(prescription).data}})


def _validate_prescription_medicine_item_input(medicine_id, quantity):
    """Pure validation, no mutation — returns (medicine, quantity, None) or (None, None, error
    Response). Split out from _create_prescription_medicine_item() so a bulk caller (the doctor
    consultation-complete flow) can validate every item in a batch before creating any of them,
    rather than risking a partially-created set if a later item turns out invalid."""
    if not medicine_id:
        return None, None, Response({'success': False, 'message': 'medicine_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return None, None, Response({'success': False, 'message': 'quantity must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
    if quantity < 1:
        return None, None, Response({'success': False, 'message': 'Quantity must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        medicine = Medicine.objects.get(id=medicine_id)
    except Medicine.DoesNotExist:
        return None, None, Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
    return medicine, quantity, None


def _create_prescription_medicine_item(prescription, medicine_id, quantity, added_by):
    """Shared validate+create logic for one PrescriptionMedicineItem — used by both the admin
    curation flow (AdminPrescriptionMedicineItemListView) and doctor-issued prescriptions
    (DoctorAppointmentCompleteView). Returns (item, None) or (None, error Response)."""
    medicine, quantity, error = _validate_prescription_medicine_item_input(medicine_id, quantity)
    if error:
        return None, error
    item = PrescriptionMedicineItem.objects.create(
        prescription=prescription, medicine=medicine, quantity=quantity, added_by=added_by,
    )
    return item, None


class AdminPrescriptionMedicineItemListView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def post(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'PENDING':
            return Response({'success': False, 'message': 'Medicines can only be added while the prescription is pending.'}, status=status.HTTP_400_BAD_REQUEST)

        item, error = _create_prescription_medicine_item(
            prescription, request.data.get('medicine_id'), request.data.get('quantity', 1), request.user,
        )
        if error:
            return error
        return Response({'success': True, 'data': {'item': PrescriptionMedicineItemSerializer(item).data}}, status=status.HTTP_201_CREATED)


class AdminPrescriptionMedicineItemDetailView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def delete(self, request, pk, item_id):
        try:
            prescription = Prescription.objects.get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'PENDING':
            return Response({'success': False, 'message': 'Medicines can only be removed while the prescription is pending.'}, status=status.HTTP_400_BAD_REQUEST)
        PrescriptionMedicineItem.objects.filter(id=item_id, prescription=prescription).delete()
        return Response({'success': True, 'message': 'Item removed.'})


class AdminPrescriptionLabTestItemListView(APIView):
    """The lab-test half of prescription curation. An uploaded prescription routinely names tests as
    well as medicines, and until now an admin could only transcribe the medicines — the tests were
    invisible to the patient. PrescriptionLabTestItem and the patient-side review screen already
    existed for doctor-issued prescriptions; this is the same funnel opened to the upload flow."""
    permission_classes = [require_permission('manage_prescriptions')]

    def post(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'PENDING':
            return Response({'success': False, 'message': 'Lab tests can only be added while the prescription is pending.'}, status=status.HTTP_400_BAD_REQUEST)

        lab_test_id = request.data.get('lab_test_id')
        if not lab_test_id:
            return Response({'success': False, 'message': 'lab_test_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lab_test = LabTest.objects.get(id=lab_test_id, is_active=True)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        # A lab test carries no quantity, so unlike a medicine a second row for the same test says
        # nothing new — it would just show the patient the same "Book This Test" card twice.
        if prescription.lab_test_items.filter(lab_test=lab_test).exists():
            return Response({'success': False, 'message': 'That lab test is already on this prescription.'}, status=status.HTTP_400_BAD_REQUEST)

        item = PrescriptionLabTestItem.objects.create(
            prescription=prescription, lab_test=lab_test, added_by=request.user,
        )
        return Response({'success': True, 'data': {'item': PrescriptionLabTestItemSerializer(item).data}}, status=status.HTTP_201_CREATED)


class AdminPrescriptionLabTestItemDetailView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def delete(self, request, pk, item_id):
        try:
            prescription = Prescription.objects.get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'PENDING':
            return Response({'success': False, 'message': 'Lab tests can only be removed while the prescription is pending.'}, status=status.HTTP_400_BAD_REQUEST)
        PrescriptionLabTestItem.objects.filter(id=item_id, prescription=prescription).delete()
        return Response({'success': True, 'message': 'Item removed.'})


class AdminCustomerListView(APIView):
    permission_classes = [require_permission('manage_customers')]

    def get(self, request):
        qs = User.objects.filter(role='CUSTOMER', is_deleted=False).order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search) | Q(phone__icontains=search))
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        customers = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'customers': UserProfileSerializer(customers, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminCustomerDetailView(APIView):
    permission_classes = [require_permission('manage_customers')]

    def get(self, request, pk):
        try:
            customer = User.objects.get(id=pk, role='CUSTOMER')
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        orders = Order.objects.filter(user=customer).select_related('address').prefetch_related('items__medicine').order_by('-placed_at')
        addresses = Address.objects.filter(user=customer).order_by('-is_default')
        prescriptions = Prescription.objects.filter(user=customer).order_by('-uploaded_at')
        reviews = Review.objects.filter(user=customer).select_related('medicine').order_by('-created_at')
        wishlist = WishlistItem.objects.filter(user=customer).select_related('medicine').order_by('-added_at')
        return Response({
            'success': True,
            'data': {
                'customer': UserProfileSerializer(customer).data,
                'orders': OrderSerializer(orders, many=True).data,
                'addresses': AddressSerializer(addresses, many=True).data,
                'prescriptions': PrescriptionSerializer(prescriptions, many=True, context={'request': request}).data,
                'reviews': MyReviewSerializer(reviews, many=True, context={'request': request}).data,
                'wishlist': MedicineListSerializer([w.medicine for w in wishlist], many=True).data,
                'stats': {
                    'total_orders': orders.count(),
                    'total_spent': sum(Decimal(o.total_amount) for o in orders if o.payment_status == 'PAID'),
                    'total_addresses': addresses.count(),
                    'total_prescriptions': prescriptions.count(),
                    'total_reviews': reviews.count(),
                    'total_wishlist': wishlist.count(),
                },
            },
        })


class AdminCustomerBlockView(APIView):
    permission_classes = [require_permission('manage_customers')]

    def put(self, request, pk):
        try:
            customer = User.objects.get(id=pk, role='CUSTOMER')
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        customer.is_active = not customer.is_active
        customer.save(update_fields=['is_active'])
        return Response({
            'success': True,
            'data': {'customer': UserProfileSerializer(customer).data},
            'message': 'Customer unblocked.' if customer.is_active else 'Customer blocked.',
        })


class AdminSettingsView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        rows = SystemSetting.objects.all()
        settings_map = {r.key: r.value for r in rows}
        return Response({'success': True, 'data': {'settings': settings_map}})

    def put(self, request):
        if not request.data:
            return Response({'success': False, 'message': 'No settings provided.'}, status=status.HTTP_400_BAD_REQUEST)
        for key, value in request.data.items():
            SystemSetting.objects.update_or_create(key=key, defaults={'value': str(value)})
        rows = SystemSetting.objects.all()
        settings_map = {r.key: r.value for r in rows}
        return Response({'success': True, 'data': {'settings': settings_map}, 'message': 'Settings saved.'})


class AdminInventoryView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request):
        qs = Medicine.objects.select_related('category', 'brand').order_by('stock_quantity')
        filter_type = request.query_params.get('filter', 'all')
        if filter_type == 'low':
            low_stock_threshold = int(_get_setting('low_stock_threshold', '10'))
            qs = qs.filter(stock_quantity__lte=low_stock_threshold, in_stock=True)
        elif filter_type == 'out':
            qs = qs.filter(in_stock=False)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__name__icontains=search))
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        medicines = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'medicines': MedicineDetailSerializer(medicines, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })

    def put(self, request, pk):
        try:
            medicine = Medicine.objects.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_stock = request.data.get('stock_quantity')
        if new_stock is not None:
            new_stock = int(new_stock)
            before = medicine.stock_quantity
            change = new_stock - before
            action = 'ADD' if change >= 0 else 'SUBTRACT'
            medicine.stock_quantity = new_stock
            medicine.in_stock = new_stock > 0
            medicine.save(update_fields=['stock_quantity', 'in_stock'])
            StockLog.objects.create(
                medicine=medicine,
                admin=request.user,
                action=action,
                quantity_before=before,
                quantity_change=abs(change),
                quantity_after=new_stock,
                note=request.data.get('note', ''),
            )
        return Response({'success': True, 'data': {'medicine': MedicineDetailSerializer(medicine).data}})


class AdminStockLogView(APIView):
    permission_classes = [require_permission('manage_inventory')]

    def get(self, request, pk):
        try:
            medicine = Medicine.objects.get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        qs = StockLog.objects.filter(medicine=medicine).select_related('admin')
        total = qs.count()
        logs = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'medicine': MedicineDetailSerializer(medicine).data,
                'logs': StockLogSerializer(logs, many=True).data,
                'pagination': {'total': total, 'page': page, 'totalPages': (total + limit - 1) // limit},
            },
        })


# ─── Admin User Management (super admin only) ─────────────────────────────────

class PermissionListView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        perms = Permission.objects.all()
        return Response({'success': True, 'data': {'permissions': PermissionSerializer(perms, many=True).data}})


class AdminUserListView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        admins = User.objects.filter(role='ADMIN').prefetch_related('permissions').order_by('full_name')
        return Response({'success': True, 'data': {'admins': AdminUserSerializer(admins, many=True).data}})

    def post(self, request):
        s = AdminUserCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)

        admin = User.objects.create_user(
            email=s.validated_data['email'],
            full_name=s.validated_data['full_name'],
            phone=s.validated_data['phone'],
            password=s.validated_data['password'],
            role='ADMIN',
            is_super_admin=s.validated_data.get('is_super_admin', False),
            is_active=True,
            is_email_verified=True,
        )
        codes = s.validated_data.get('permission_codes') or []
        if codes:
            admin.permissions.set(Permission.objects.filter(code__in=codes))

        return Response({'success': True, 'data': {'admin': AdminUserSerializer(admin).data}, 'message': 'Admin created.'}, status=status.HTTP_201_CREATED)


class AdminUserDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        try:
            admin = User.objects.get(id=pk, role='ADMIN')
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Admin not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'admin': AdminUserSerializer(admin).data}})

    def patch(self, request, pk):
        try:
            admin = User.objects.get(id=pk, role='ADMIN')
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Admin not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'full_name' in request.data:
            admin.full_name = request.data['full_name']
        if 'is_active' in request.data:
            admin.is_active = bool(request.data['is_active'])
        if 'is_super_admin' in request.data:
            admin.is_super_admin = bool(request.data['is_super_admin'])
        admin.save()

        if 'permission_codes' in request.data:
            codes = request.data.get('permission_codes') or []
            admin.permissions.set(Permission.objects.filter(code__in=codes))

        return Response({'success': True, 'data': {'admin': AdminUserSerializer(admin).data}, 'message': 'Admin updated.'})


# ─── Admin: Pharmacies & Delivery Agents (marketplace account management) ─────

class AdminPharmacyListView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def get(self, request):
        pharmacies = Pharmacy.objects.select_related('user').order_by('name')
        return Response({'success': True, 'data': {'pharmacies': AdminPharmacySerializer(pharmacies, many=True).data}})

    def post(self, request):
        s = AdminPharmacyCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['name'], phone=d['phone'], password=d['password'],
                role='PHARMACY', is_active=True, is_email_verified=True,
            )
            pharmacy = Pharmacy.objects.create(
                user=user, name=d['name'], license_number=d['license_number'], phone=d['phone'],
                address=d['address'], lat=d['lat'], lng=d['lng'],
            )

        # Two channels, deliberately split (same as the lab-collector onboarding): the in-app bell
        # entry never carries the password (a Notification row persists in the DB and is visible on
        # every future login), while the one-time welcome email does — so the pharmacy can sign in
        # immediately, with a nudge to change it afterward.
        Notification.objects.create(
            user=user, type='ACCOUNT_UPDATE', title='Your pharmacy account is ready',
            message='You can now sign in to manage your storefront, incoming orders and payouts.',
            link='/pharmacy',
        )
        send_pharmacy_welcome_email(user, d['password'], pharmacy_name=pharmacy.name)

        return Response({'success': True, 'data': {'pharmacy': AdminPharmacySerializer(pharmacy).data}, 'message': 'Pharmacy account created — remember to verify it before it can receive orders.'}, status=status.HTTP_201_CREATED)


class AdminPharmacyDetailView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def get(self, request, pk):
        try:
            pharmacy = Pharmacy.objects.select_related('user').get(id=pk)
        except Pharmacy.DoesNotExist:
            return Response({'success': False, 'message': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = AdminPharmacySerializer(pharmacy).data
        data['documents'] = PharmacyDocumentSerializer(pharmacy.documents.all(), many=True).data
        data['location_change_requests'] = PharmacyLocationChangeRequestSerializer(
            pharmacy.location_change_requests.select_related('reviewed_by').order_by('-created_at'), many=True,
        ).data
        data['listings_count'] = pharmacy.listings.count()

        # request_stats: how this pharmacy actually responds to what it's offered — accepted vs
        # declined vs expired (ignored/too slow) vs still-pending. This is the pharmacy
        # performance-tracking data, independent of whether any order ever got PLACED.
        status_counts = dict(
            pharmacy.fulfillment_requests.values('status').annotate(count=Count('id')).values_list('status', 'count')
        )
        data['request_stats'] = {
            'accepted': status_counts.get('ACCEPTED', 0),
            'declined': status_counts.get('DECLINED', 0),
            'expired': status_counts.get('EXPIRED', 0),
            'pending': status_counts.get('PENDING', 0),
        }

        # finance: same gross/commission/net breakdown as the pharmacy's own Finance page, computed
        # here for admin instead of relying on the pharmacy to self-report anything.
        payouts = pharmacy.payouts.all()
        data['finance'] = {
            'total_earned': str(payouts.aggregate(s=Sum('gross_amount'))['s'] or Decimal('0')),
            'total_commission': str(payouts.aggregate(s=Sum('commission_amount'))['s'] or Decimal('0')),
            'total_paid': str(payouts.filter(status='PAID').aggregate(s=Sum('net_payable'))['s'] or Decimal('0')),
            'total_pending': str(payouts.filter(status='PENDING').aggregate(s=Sum('net_payable'))['s'] or Decimal('0')),
        }

        data['campaign_enrollments'] = PharmacyCampaignEnrollmentSerializer(
            pharmacy.campaign_enrollments.select_related('campaign').order_by('-enrolled_at'), many=True,
        ).data

        return Response({'success': True, 'data': {'pharmacy': data}})

    def patch(self, request, pk):
        try:
            pharmacy = Pharmacy.objects.select_related('user').get(id=pk)
        except Pharmacy.DoesNotExist:
            return Response({'success': False, 'message': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('name', 'phone', 'address', 'lat', 'lng'):
            if field in request.data:
                setattr(pharmacy, field, request.data[field])
        if 'is_verified' in request.data:
            pharmacy.is_verified = bool(request.data['is_verified'])
        if 'is_active' in request.data:
            pharmacy.is_active = bool(request.data['is_active'])
        pharmacy.save()

        # a suspended pharmacy account shouldn't be able to log in at all, not just stop
        # receiving broadcasts — is_active vs user_is_active are deliberately separate:
        # is_active is the pharmacy's own "we're closed right now" toggle (Stage 5+), this is
        # the admin's harder suspension switch.
        if 'user_is_active' in request.data:
            pharmacy.user.is_active = bool(request.data['user_is_active'])
            pharmacy.user.save(update_fields=['is_active'])

        return Response({'success': True, 'data': {'pharmacy': AdminPharmacySerializer(pharmacy).data}, 'message': 'Pharmacy updated.'})


class AdminPharmacyLocationChangeApproveView(APIView):
    """Only path that actually moves Pharmacy.lat/lng away from what it was admin-set to
    originally (see PharmacyProfileView.patch() — pharmacies can't self-edit it) or a prior
    approval here. Applies the pharmacy's REQUESTED values verbatim, not whatever the admin might
    have separately typed elsewhere — this endpoint's whole job is reviewing THIS request."""
    permission_classes = [require_permission('manage_pharmacies')]

    def post(self, request, pharmacy_id, pk):
        try:
            req = PharmacyLocationChangeRequest.objects.select_related('pharmacy').get(id=pk, pharmacy_id=pharmacy_id, status='PENDING')
        except PharmacyLocationChangeRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Pending location change request not found.'}, status=status.HTTP_404_NOT_FOUND)

        pharmacy = req.pharmacy
        pharmacy.lat = req.requested_lat
        pharmacy.lng = req.requested_lng
        update_fields = ['lat', 'lng']
        if req.requested_address:
            pharmacy.address = req.requested_address
            update_fields.append('address')
        pharmacy.save(update_fields=update_fields)

        req.status = 'APPROVED'
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        notify_user(
            user=pharmacy.user, type='PHARMACY_LOCATION_CHANGE_REVIEWED', title='Location Change Approved',
            message='Your requested pharmacy location change has been approved and is now live.',
            link='/pharmacy/settings',
        )

        return Response({
            'success': True,
            'data': {'request': PharmacyLocationChangeRequestSerializer(req).data, 'pharmacy': AdminPharmacySerializer(pharmacy).data},
            'message': 'Location change approved.',
        })


class AdminPharmacyLocationChangeRejectView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def post(self, request, pharmacy_id, pk):
        admin_note = (request.data.get('admin_note') or '').strip()
        if not admin_note:
            return Response({'success': False, 'message': 'admin_note is required — explain why this request was rejected.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            req = PharmacyLocationChangeRequest.objects.select_related('pharmacy__user').get(id=pk, pharmacy_id=pharmacy_id, status='PENDING')
        except PharmacyLocationChangeRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Pending location change request not found.'}, status=status.HTTP_404_NOT_FOUND)

        req.status = 'REJECTED'
        req.admin_note = admin_note
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

        notify_user(
            user=req.pharmacy.user, type='PHARMACY_LOCATION_CHANGE_REVIEWED', title='Location Change Rejected',
            message=f'Your requested pharmacy location change was rejected: {admin_note}',
            link='/pharmacy/settings',
        )

        return Response({'success': True, 'data': {'request': PharmacyLocationChangeRequestSerializer(req).data}, 'message': 'Location change rejected.'})


class AdminDoctorProfileChangeApproveView(APIView):
    """Applies a doctor's REQUESTED profile values onto the live Doctor row — the only path that
    moves bio/qualification/experience/languages/social_links/photo, since the doctor can't
    self-edit them directly (see DoctorProfileChangeRequestView). Mirrors the pharmacy location
    approve view. The scalar fields are the doctor's full desired state, so they're applied
    verbatim; experience_years is guarded because the request lets it be left blank."""
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk, req_pk):
        try:
            req = DoctorProfileChangeRequest.objects.select_related('doctor__user').get(id=req_pk, doctor_id=pk, status='PENDING')
        except DoctorProfileChangeRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Pending profile change request not found.'}, status=status.HTTP_404_NOT_FOUND)

        doctor = req.doctor
        doctor.bio = req.requested_bio
        doctor.qualification = req.requested_qualification
        if req.requested_experience_years is not None:
            doctor.experience_years = req.requested_experience_years
        doctor.languages = req.requested_languages
        doctor.social_links = req.requested_social_links or []
        # photo_url stays a CharField: in prod .url is the absolute R2 URL, in dev the relative
        # /media path — both resolve correctly through the frontend's resolveImg().
        if req.requested_photo:
            doctor.photo_url = req.requested_photo.url
        doctor.save()

        req.status = 'APPROVED'
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

        if doctor.user_id:
            notify_user(
                user=doctor.user, type='DOCTOR_PROFILE_CHANGE_REVIEWED', title='Profile Changes Approved',
                message='Your profile changes have been approved and are now live.',
                link='/doctor/profile',
            )

        return Response({
            'success': True,
            'data': {'request': DoctorProfileChangeRequestSerializer(req, context={'request': request}).data, 'doctor': AdminDoctorSerializer(doctor).data},
            'message': 'Profile changes approved.',
        })


class AdminDoctorProfileChangeRejectView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk, req_pk):
        admin_note = (request.data.get('admin_note') or '').strip()
        if not admin_note:
            return Response({'success': False, 'message': 'admin_note is required — explain why this request was rejected.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            req = DoctorProfileChangeRequest.objects.select_related('doctor__user').get(id=req_pk, doctor_id=pk, status='PENDING')
        except DoctorProfileChangeRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Pending profile change request not found.'}, status=status.HTTP_404_NOT_FOUND)

        req.status = 'REJECTED'
        req.admin_note = admin_note
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

        if req.doctor.user_id:
            notify_user(
                user=req.doctor.user, type='DOCTOR_PROFILE_CHANGE_REVIEWED', title='Profile Changes Rejected',
                message=f'Your profile changes were rejected: {admin_note}',
                link='/doctor/profile',
            )

        return Response({'success': True, 'data': {'request': DoctorProfileChangeRequestSerializer(req, context={'request': request}).data}, 'message': 'Profile changes rejected.'})


class AdminDoctorDocumentApproveView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk, doc_pk):
        try:
            doc = DoctorDocument.objects.select_related('doctor__user').get(id=doc_pk, doctor_id=pk)
        except DoctorDocument.DoesNotExist:
            return Response({'success': False, 'message': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)

        doc.status = 'APPROVED'
        doc.admin_note = None
        doc.reviewed_by = request.user
        doc.reviewed_at = timezone.now()
        doc.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

        if doc.doctor.user_id:
            notify_user(
                user=doc.doctor.user, type='DOCTOR_DOCUMENT_REVIEWED', title='Document Approved',
                message=f'Your document "{doc.title}" was approved and now shows on your public profile.',
                link='/doctor/profile',
            )

        return Response({'success': True, 'data': {'document': DoctorDocumentSerializer(doc, context={'request': request}).data}, 'message': 'Document approved.'})


class AdminDoctorDocumentRejectView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def post(self, request, pk, doc_pk):
        admin_note = (request.data.get('admin_note') or '').strip()
        if not admin_note:
            return Response({'success': False, 'message': 'admin_note is required — explain why this document was rejected.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            doc = DoctorDocument.objects.select_related('doctor__user').get(id=doc_pk, doctor_id=pk)
        except DoctorDocument.DoesNotExist:
            return Response({'success': False, 'message': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)

        doc.status = 'REJECTED'
        doc.admin_note = admin_note
        doc.reviewed_by = request.user
        doc.reviewed_at = timezone.now()
        doc.save(update_fields=['status', 'admin_note', 'reviewed_by', 'reviewed_at'])

        if doc.doctor.user_id:
            notify_user(
                user=doc.doctor.user, type='DOCTOR_DOCUMENT_REVIEWED', title='Document Rejected',
                message=f'Your document "{doc.title}" was rejected: {admin_note}',
                link='/doctor/profile',
            )

        return Response({'success': True, 'data': {'document': DoctorDocumentSerializer(doc, context={'request': request}).data}, 'message': 'Document rejected.'})


class AdminPharmacyDocumentView(APIView):
    """Admin-side upload for the one document PharmaX itself provides for a given pharmacy — the
    signed MOU. (The cancelled cheque is proof of the pharmacy's OWN bank account, so — like the
    PAN card and citizenship — it's uploaded by the pharmacy itself via PharmacyDocumentView, not
    here.) Mirrors PharmacyDocumentView's mechanics via the shared _save_pharmacy_document()
    helper; only the allowed doc_type and how the pharmacy is resolved differ."""
    permission_classes = [require_permission('manage_pharmacies')]
    ADMIN_UPLOADED_TYPES = ('MOU',)

    def post(self, request, pk):
        try:
            pharmacy = Pharmacy.objects.get(id=pk)
        except Pharmacy.DoesNotExist:
            return Response({'success': False, 'message': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)

        doc_type = request.data.get('doc_type')
        if doc_type not in self.ADMIN_UPLOADED_TYPES:
            return Response({'success': False, 'message': 'You can only upload the signed MOU here.'}, status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in DOCUMENT_CONTENT_TYPES:
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or PDF files are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        max_size = _document_max_size_bytes()
        if file.size > max_size:
            return Response({'success': False, 'message': f'File must be under {max_size // (1024 * 1024)}MB.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = _save_pharmacy_document(pharmacy, doc_type, file, request.user)
        return Response({'success': True, 'data': {'document': PharmacyDocumentSerializer(doc).data}, 'message': 'Document uploaded.'})


class AdminDeliveryAgentListView(APIView):
    permission_classes = [require_permission('manage_delivery_agents')]

    def get(self, request):
        agents = DeliveryAgent.objects.select_related('user').order_by('user__full_name')
        return Response({'success': True, 'data': {'agents': AdminDeliveryAgentSerializer(agents, many=True).data}})

    def post(self, request):
        s = AdminDeliveryAgentCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['full_name'], phone=d['phone'], password=d['password'],
                role='DELIVERY_AGENT', is_active=True, is_email_verified=True,
            )
            agent = DeliveryAgent.objects.create(user=user, phone=d['phone'], vehicle_type=d.get('vehicle_type', ''))

        return Response({'success': True, 'data': {'agent': AdminDeliveryAgentSerializer(agent).data}, 'message': 'Delivery agent account created — remember to verify it before they can accept deliveries.'}, status=status.HTTP_201_CREATED)


class AdminDeliveryAgentDetailView(APIView):
    permission_classes = [require_permission('manage_delivery_agents')]

    def get(self, request, pk):
        try:
            agent = DeliveryAgent.objects.select_related('user').get(id=pk)
        except DeliveryAgent.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery agent not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'agent': AdminDeliveryAgentSerializer(agent).data}})

    def patch(self, request, pk):
        try:
            agent = DeliveryAgent.objects.select_related('user').get(id=pk)
        except DeliveryAgent.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery agent not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'vehicle_type' in request.data:
            agent.vehicle_type = request.data['vehicle_type']
        if 'is_verified' in request.data:
            agent.is_verified = bool(request.data['is_verified'])
        agent.save()

        # same reasoning as AdminPharmacyDetailView: user_is_active is the admin's suspension
        # switch, separate from is_online (the rider's own go-online/offline toggle, Stage 6+).
        if 'user_is_active' in request.data:
            agent.user.is_active = bool(request.data['user_is_active'])
            agent.user.save(update_fields=['is_active'])

        return Response({'success': True, 'data': {'agent': AdminDeliveryAgentSerializer(agent).data}, 'message': 'Delivery agent updated.'})


class AdminLabCollectorListView(APIView):
    """Mirrors AdminDeliveryAgentListView exactly — same admin-created-only onboarding, same
    starts-unverified default. Gated by manage_lab_tests (not a new permission code) since
    collectors are lab-tests-domain workers, the same way AdminLabTestBookingDetailView etc.
    already are."""
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request):
        collectors = LabCollector.objects.select_related('user').order_by('user__full_name')
        return Response({'success': True, 'data': {'collectors': AdminLabCollectorSerializer(collectors, many=True).data}})

    def post(self, request):
        s = AdminLabCollectorCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['full_name'], phone=d['phone'], password=d['password'],
                role='LAB_COLLECTOR', is_active=True, is_email_verified=True,
            )
            collector = LabCollector.objects.create(user=user, phone=d['phone'])

        # Two channels, deliberately split: the in-app bell entry never carries the password (a
        # Notification row persists in the DB and is visible on every future login), while the
        # one-time welcome email does — so the collector can sign in immediately, with a nudge to
        # change it afterward. Both run post-commit so we never announce a user a rollback undid.
        Notification.objects.create(
            user=user, type='ACCOUNT_UPDATE', title='Your collector account is ready',
            message='You can now sign in to see and manage the collections assigned to you.',
            link='/lab-collector',
        )
        send_collector_welcome_email(user, d['password'])

        return Response({'success': True, 'data': {'collector': AdminLabCollectorSerializer(collector).data}, 'message': 'Lab collector account created — remember to verify it before they can accept collections.'}, status=status.HTTP_201_CREATED)


class AdminLabCollectorDetailView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request, pk):
        try:
            collector = LabCollector.objects.select_related('user').get(id=pk)
        except LabCollector.DoesNotExist:
            return Response({'success': False, 'message': 'Lab collector not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'collector': AdminLabCollectorSerializer(collector).data}})

    def patch(self, request, pk):
        try:
            collector = LabCollector.objects.select_related('user').get(id=pk)
        except LabCollector.DoesNotExist:
            return Response({'success': False, 'message': 'Lab collector not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'is_verified' in request.data:
            collector.is_verified = bool(request.data['is_verified'])
        collector.save()

        if 'user_is_active' in request.data:
            collector.user.is_active = bool(request.data['user_is_active'])
            collector.user.save(update_fields=['is_active'])

        return Response({'success': True, 'data': {'collector': AdminLabCollectorSerializer(collector).data}, 'message': 'Lab collector updated.'})


# ─── Doctor Dashboard (Stage 2 of the doctor consult spec) ────────────────────
#
# Every view below is gated by IsDoctor (role-only) AND additionally scoped to request.user.doctor
# — same two-layer pattern as the pharmacy/delivery dashboards (get_managed_pharmacy() there,
# request.user.doctor here, since a doctor has no team-member concept to resolve).

def _doctor_not_found_response():
    return Response({'success': False, 'message': 'No doctor is associated with this account.'}, status=status.HTTP_403_FORBIDDEN)


class DoctorProfileView(APIView):
    """Self-service 'who am I' for the doctor dashboard — mirrors PharmacyProfileView.get(). Not
    part of the Stage 2 endpoint list, added because Stage 3's dashboard needs the doctor's own
    name/specialty/consultation_fee/is_verified and there was nowhere to fetch it from."""
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        ctx = {'request': request}
        # Meta ordering is -created_at / -uploaded_at, so .first() is the newest change request and
        # the documents come newest-first — the profile page shows the doctor their latest submission
        # status (incl. admin_note on reject) alongside the currently-live values.
        latest_change = doctor.profile_change_requests.first()
        return Response({'success': True, 'data': {
            'doctor': AdminDoctorSerializer(doctor).data,
            'profile_change_request': DoctorProfileChangeRequestSerializer(latest_change, context=ctx).data if latest_change else None,
            'documents': DoctorDocumentSerializer(doctor.documents.all(), many=True, context=ctx).data,
        }})


def _parse_doctor_social_links(raw):
    """Validate the doctor's submitted social/website links. Accepts a JSON string (as sent in the
    multipart body) or an already-parsed list. Returns (cleaned_list, error_message); on error the
    list is None. Enforces the 'flexible list of {label, url}' shape: ≤10 rows, non-empty label
    (≤50 chars) and http(s) url (≤500 chars) on each."""
    if raw in (None, ''):
        return [], None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return None, 'Links must be valid JSON.'
    if not isinstance(raw, list):
        return None, 'Links must be a list.'
    if len(raw) > 10:
        return None, 'You can add at most 10 links.'
    cleaned = []
    for item in raw:
        if not isinstance(item, dict):
            return None, 'Each link needs a label and a url.'
        label = (item.get('label') or '').strip()
        url = (item.get('url') or '').strip()
        if not label or not url:
            return None, 'Each link needs both a label and a url.'
        if len(label) > 50:
            return None, 'Each link label must be 50 characters or fewer.'
        if not (url.startswith('http://') or url.startswith('https://')):
            return None, 'Each link url must start with http:// or https://.'
        if len(url) > 500:
            return None, 'Each link url is too long (max 500 characters).'
        cleaned.append({'label': label, 'url': url})
    return cleaned, None


class DoctorProfileChangeRequestView(APIView):
    """The reviewed path for a doctor to edit their own public profile — bio, qualification, years
    of experience, languages, social links and photo. Mirrors PharmacyLocationChangeRequestView:
    nothing touches the live Doctor row until an admin approves, and only one PENDING request may
    exist at a time. Name, specialty, fee, license and the is_verified flag stay admin-only and are
    never accepted here. The doctor submits the FULL desired state of the scalar fields (the form is
    pre-filled with current values); an optional new photo is uploaded as requested_photo."""
    permission_classes = [IsDoctor]

    def post(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()

        if doctor.profile_change_requests.filter(status='PENDING').exists():
            return Response({
                'success': False,
                'message': 'You already have a pending profile change awaiting review — wait for it to be reviewed before submitting another.',
            }, status=status.HTTP_400_BAD_REQUEST)

        social_links, err = _parse_doctor_social_links(request.data.get('social_links'))
        if err:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)

        experience_years = request.data.get('experience_years')
        if experience_years in (None, ''):
            experience_years = None
        else:
            try:
                experience_years = int(experience_years)
                if not (0 <= experience_years <= 80):
                    raise ValueError
            except (TypeError, ValueError):
                return Response({'success': False, 'message': 'Years of experience must be a whole number between 0 and 80.'}, status=status.HTTP_400_BAD_REQUEST)

        photo = request.FILES.get('photo')
        if photo:
            if photo.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
                return Response({'success': False, 'message': 'Profile photo must be a JPG, PNG, or WebP image.'}, status=status.HTTP_400_BAD_REQUEST)
            max_size = _document_max_size_bytes()
            if photo.size > max_size:
                return Response({'success': False, 'message': f'Photo must be under {max_size // (1024 * 1024)}MB.'}, status=status.HTTP_400_BAD_REQUEST)

        def _clean(value, limit):
            value = (value or '').strip()
            return value[:limit] or None

        req = DoctorProfileChangeRequest.objects.create(
            doctor=doctor,
            requested_bio=(request.data.get('bio') or '').strip() or None,
            requested_qualification=_clean(request.data.get('qualification'), 255),
            requested_experience_years=experience_years,
            requested_languages=_clean(request.data.get('languages'), 255),
            requested_social_links=social_links,
            requested_photo=photo if photo else None,
        )

        _notify_admins(
            'manage_doctors', 'DOCTOR_PROFILE_CHANGE_REQUEST', 'Doctor Profile Change Requested',
            f'Dr. {doctor.name} submitted profile changes — review before they go public.',
            link=f'/admin/doctor-consult/{doctor.id}',
        )

        return Response({
            'success': True,
            'data': {'profile_change_request': DoctorProfileChangeRequestSerializer(req, context={'request': request}).data},
            'message': 'Profile changes submitted — an admin will review them shortly.',
        }, status=status.HTTP_201_CREATED)


class DoctorDocumentView(APIView):
    """Self-service research/credential document upload for the doctor's own profile. Each row is
    reviewed independently (PENDING → APPROVED/REJECTED) and only APPROVED docs show publicly. Uses
    a real FileField (routed through default_storage → R2 in prod) rather than the pharmacy-document
    FileSystemStorage pattern, which only writes to Render's ephemeral local disk."""
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        docs = doctor.documents.all()
        return Response({'success': True, 'data': {'documents': DoctorDocumentSerializer(docs, many=True, context={'request': request}).data}})

    def post(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()

        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({'success': False, 'message': 'A title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        title = title[:200]

        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in DOCUMENT_CONTENT_TYPES:
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or PDF files are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        max_size = _document_max_size_bytes()
        if file.size > max_size:
            return Response({'success': False, 'message': f'File must be under {max_size // (1024 * 1024)}MB.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = DoctorDocument.objects.create(doctor=doctor, title=title, file=file)
        _notify_admins(
            'manage_doctors', 'DOCTOR_DOCUMENT_UPLOADED', 'Doctor Document Uploaded',
            f'Dr. {doctor.name} uploaded "{title}" — review before it shows publicly.',
            link=f'/admin/doctor-consult/{doctor.id}',
        )
        return Response({
            'success': True,
            'data': {'document': DoctorDocumentSerializer(doc, context={'request': request}).data},
            'message': 'Document uploaded — an admin will review it shortly.',
        }, status=status.HTTP_201_CREATED)


class DoctorDocumentDetailView(APIView):
    permission_classes = [IsDoctor]

    def delete(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            doc = doctor.documents.get(id=pk)
        except DoctorDocument.DoesNotExist:
            return Response({'success': False, 'message': 'Document not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Delete the stored file first (Pattern B FileField → default_storage/R2), then the row.
        if doc.file:
            doc.file.delete(save=False)
        doc.delete()
        return Response({'success': True, 'message': 'Document removed.'})


class DoctorAvailabilityListView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        avail = doctor.availability.order_by('day_of_week')
        return Response({'success': True, 'data': {'availability': DoctorAvailabilitySerializer(avail, many=True).data}})

    def post(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()

        day_of_week = request.data.get('day_of_week')
        if day_of_week is None or int(day_of_week) not in dict(DoctorAvailability.WEEKDAYS):
            return Response({'success': False, 'message': 'A valid day_of_week (0=Monday..6=Sunday) is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if doctor.availability.filter(day_of_week=day_of_week).exists():
            return Response({'success': False, 'message': 'A pattern for this day already exists — update it instead.'}, status=status.HTTP_400_BAD_REQUEST)

        s = DoctorAvailabilitySerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        row = DoctorAvailability.objects.create(doctor=doctor, **s.validated_data)
        return Response({'success': True, 'data': {'availability': DoctorAvailabilitySerializer(row).data}}, status=status.HTTP_201_CREATED)


class DoctorAvailabilityDetailView(APIView):
    permission_classes = [IsDoctor]

    def patch(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            row = doctor.availability.get(id=pk)
        except DoctorAvailability.DoesNotExist:
            return Response({'success': False, 'message': 'Availability pattern not found.'}, status=status.HTTP_404_NOT_FOUND)

        s = DoctorAvailabilitySerializer(row, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'availability': s.data}})

    def delete(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            row = doctor.availability.get(id=pk)
        except DoctorAvailability.DoesNotExist:
            return Response({'success': False, 'message': 'Availability pattern not found.'}, status=status.HTTP_404_NOT_FOUND)
        row.delete()
        return Response({'success': True, 'message': 'Availability pattern removed.'})


class DoctorOwnAppointmentListView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        qs = (
            doctor.appointments
            .select_related('user')
            .prefetch_related(*APPOINTMENT_PRESCRIPTION_PREFETCH)
            .order_by('-booked_at')
        )
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({'success': True, 'data': {'appointments': DoctorAppointmentSerializer(qs, many=True, context={'request': request}).data}})


class DoctorAppointmentConfirmView(APIView):
    """The doctor's own path to PENDING -> CONFIRMED — previously only AdminAppointmentDetailView
    could do this. Gated on payment_status already being resolved (PAID or NOT_REQUIRED) —
    unlike AdminAppointmentDetailView's unconditional status flip, this endpoint must not let a
    doctor confirm (and later complete()) a session that was never actually paid for, since
    complete() creates a real DoctorPayout obligation off of it."""
    permission_classes = [IsDoctor]

    def post(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            appt = doctor.appointments.get(id=pk)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appt.status != 'PENDING':
            return Response({'success': False, 'message': f'Can only confirm a pending appointment (current status: {appt.status}).'}, status=status.HTTP_400_BAD_REQUEST)
        if appt.payment_status not in ('PAID', 'NOT_REQUIRED'):
            return Response({'success': False, 'message': 'Payment must be completed before this appointment can be confirmed.'}, status=status.HTTP_400_BAD_REQUEST)

        appt.status = 'CONFIRMED'
        appt.save(update_fields=['status'])
        _ensure_meeting_link(appt)

        notify_user(
            user=appt.user, type='APPOINTMENT_UPDATE', title='Appointment Confirmed',
            message=f'Dr. {doctor.name} has confirmed your appointment on {appt.scheduled_date} at {appt.time_slot}.',
            link='/appointments',
        )
        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt, context={'request': request}).data}, 'message': 'Appointment confirmed.'})


class DoctorAppointmentSetMeetingLinkView(APIView):
    permission_classes = [IsDoctor]

    def post(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            appt = doctor.appointments.get(id=pk)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appt.status != 'CONFIRMED':
            return Response({'success': False, 'message': f'Can only set a meeting link once the appointment is confirmed (current status: {appt.status}).'}, status=status.HTTP_400_BAD_REQUEST)

        meeting_link = (request.data.get('meeting_link') or '').strip()
        if not meeting_link:
            return Response({'success': False, 'message': 'meeting_link is required.'}, status=status.HTTP_400_BAD_REQUEST)

        appt.meeting_link = meeting_link
        appt.save(update_fields=['meeting_link'])

        notify_user(
            user=appt.user, type='APPOINTMENT_UPDATE', title='Meeting Link Ready',
            message=f'Dr. {doctor.name} has shared the meeting link for your appointment on {appt.scheduled_date}.',
            link='/appointments',
        )
        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt, context={'request': request}).data}, 'message': 'Meeting link set.'})


class DoctorAppointmentCompleteView(APIView):
    permission_classes = [IsDoctor]

    def post(self, request, pk):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        try:
            appt = doctor.appointments.get(id=pk)
        except DoctorAppointment.DoesNotExist:
            return Response({'success': False, 'message': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appt.status != 'CONFIRMED':
            return Response({'success': False, 'message': f'Can only complete a confirmed appointment (current status: {appt.status}).'}, status=status.HTTP_400_BAD_REQUEST)

        notes = (request.data.get('notes') or '').strip()
        if not notes:
            return Response({'success': False, 'message': 'Consultation notes are required to complete this appointment.'}, status=status.HTTP_400_BAD_REQUEST)

        medicine_entries = request.data.get('medicine_items') or []
        if not isinstance(medicine_entries, list):
            return Response({'success': False, 'message': "'medicine_items' must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        lab_test_ids = request.data.get('lab_test_items') or []
        if not isinstance(lab_test_ids, list):
            return Response({'success': False, 'message': "'lab_test_items' must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate every attached item BEFORE mutating anything — a bad medicine/lab-test id
        # partway through must not leave the appointment COMPLETED with a half-built prescription
        # that the existing admin curation UI can't even fix (it only allows edits while a
        # prescription is PENDING, and this one is created VERIFIED).
        resolved_medicines = []
        for entry in medicine_entries:
            if not isinstance(entry, dict):
                return Response({'success': False, 'message': 'Each medicine_items entry must be an object with medicine_id and quantity.'}, status=status.HTTP_400_BAD_REQUEST)
            medicine, quantity, error = _validate_prescription_medicine_item_input(entry.get('medicine_id'), entry.get('quantity', 1))
            if error:
                return error
            resolved_medicines.append((medicine, quantity))

        resolved_lab_tests = []
        for lab_test_id in lab_test_ids:
            try:
                resolved_lab_tests.append(LabTest.objects.get(id=lab_test_id, is_active=True))
            except LabTest.DoesNotExist:
                return Response({'success': False, 'message': f'Lab test not found: {lab_test_id}'}, status=status.HTTP_404_NOT_FOUND)

        # Both optional — set only if the doctor recommends a follow-up.
        follow_up_date = None
        raw_follow_up_date = request.data.get('follow_up_date')
        if raw_follow_up_date:
            follow_up_date = parse_date(raw_follow_up_date)
            if not follow_up_date:
                return Response({'success': False, 'message': 'follow_up_date must be a valid date (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
        follow_up_notes = (request.data.get('follow_up_notes') or '').strip() or None

        appt.status = 'COMPLETED'
        appt.follow_up_date = follow_up_date
        appt.follow_up_notes = follow_up_notes
        appt.save(update_fields=['status', 'follow_up_date', 'follow_up_notes'])

        # Idempotency guard — same hasattr() pattern as matching._create_settlement_records(), in
        # case this is somehow called twice for the same appointment.
        if not hasattr(appt, 'payout'):
            commission_rate = Decimal(_get_setting('doctor_commission_rate', '15'))
            # fee_amount is always the doctor's real consultation_fee at booking time, unlike
            # fee_charged (what the PATIENT paid, 0 for a Plus-free booking) — the doctor is paid
            # their normal share either way, PharmaX absorbs the Plus discount itself.
            gross = appt.fee_amount
            commission = (gross * commission_rate / Decimal('100')).quantize(Decimal('0.01'))
            DoctorPayout.objects.create(
                doctor=doctor, appointment=appt,
                gross_amount=gross, commission_rate=commission_rate, commission_amount=commission,
                net_payable=gross - commission,
            )
            doctor.total_consultations = F('total_consultations') + 1
            doctor.save(update_fields=['total_consultations'])
            # F() leaves doctor.total_consultations holding an unresolved expression in memory —
            # serializing it as-is below would crash. Refresh it, and repoint appt.doctor at this
            # same refreshed instance so the response doesn't serialize whichever object DRF's
            # related-object caching happened to hand back.
            doctor.refresh_from_db(fields=['total_consultations'])
            appt.doctor = doctor

        # Notes are required, so every completed consultation gets a real Prescription — some
        # just end up with zero medicine_items/lab_test_items attached. status='VERIFIED' since a
        # live consultation IS the verification, unlike an uploaded photo an admin has to assess.
        if not hasattr(appt, 'prescription'):
            presc = Prescription.objects.create(
                user=appt.user, source='CONSULTATION', appointment=appt,
                doctor=doctor.name, notes=notes, status='VERIFIED',
            )
            for medicine, quantity in resolved_medicines:
                _create_prescription_medicine_item(presc, medicine.id, quantity, request.user)
            for lab_test in resolved_lab_tests:
                PrescriptionLabTestItem.objects.create(prescription=presc, lab_test=lab_test, added_by=request.user)

            # Render the finished prescription to a PDF and store it on the record, so the patient
            # can download it and it can be emailed as an attachment. Generated AFTER the medicine
            # and lab items are attached so the document reflects them. A rendering failure must not
            # block completion — the appointment is already COMPLETED and the payout written above,
            # and this view isn't atomic — so log it and carry on: the record still exists in-app
            # and the email below degrades to a link-only message.
            try:
                pdf_bytes = build_prescription_pdf(presc)
                presc.file_name = f'prescription-{presc.id}.pdf'
                presc.file.save(presc.file_name, ContentFile(pdf_bytes), save=True)
            except Exception:
                logger.exception('Prescription PDF generation failed for %s', presc.id)

            # Reuses AdminPrescriptionDetailView.put()'s verify-notification shape (count-based
            # message, link to the review screen), extended to mention lab tests too when present.
            medicine_count = len(resolved_medicines)
            lab_test_count = len(resolved_lab_tests)
            if medicine_count or lab_test_count:
                parts = []
                if medicine_count:
                    parts.append(f'{medicine_count} medicine(s)')
                if lab_test_count:
                    parts.append(f'{lab_test_count} test(s)')
                message = f'Dr. {doctor.name} has completed your consultation — we found {" and ".join(parts)}. Review and act on them.'
                link = f'/prescriptions/{presc.id}/review'
            else:
                message = f'Dr. {doctor.name} has completed your consultation — your notes are ready.'
                link = '/appointments'
            # In-app bell row written directly (not via notify_user) because the matching email is
            # sent separately by send_prescription_ready_email — which ATTACHES the PDF, unlike the
            # plain email notify_user would send. Routing both through notify_user would double-email.
            Notification.objects.create(
                user=appt.user, type='PRESCRIPTION', title='Consultation Notes Ready',
                message=message, link=link,
            )
            send_prescription_ready_email(presc)

        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt, context={'request': request}).data}, 'message': 'Appointment marked complete.'})


class DoctorPayoutListView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        payouts = doctor.payouts.select_related('appointment__user').order_by('-created_at')
        return Response({'success': True, 'data': {'payouts': DoctorPayoutSerializer(payouts, many=True).data}})


class DoctorPatientListView(APIView):
    """Distinct patients this doctor has ever had an appointment with — one aggregation query
    (via .values().annotate()), not one query per patient. nearest_follow_up is the single
    earliest follow_up_date across all of this patient's appointments with this doctor, whichever
    direction it points: already overdue (in the past) or still upcoming (in the future) — the
    signed days_until_follow_up below is what actually distinguishes the two for the UI."""
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()

        rows = (
            DoctorAppointment.objects.filter(doctor=doctor)
            .values('user_id', 'user__full_name', 'user__email', 'user__phone')
            .annotate(
                appointment_count=Count('id'),
                last_visit=Max('scheduled_date'),
                nearest_follow_up_date=Min('follow_up_date'),
            )
            .order_by('-last_visit')
        )

        today = timezone.now().date()
        patients = [{
            'user_id': str(row['user_id']),
            'full_name': row['user__full_name'],
            'email': row['user__email'],
            'phone': row['user__phone'],
            'appointment_count': row['appointment_count'],
            'last_visit': row['last_visit'],
            'follow_up_date': row['nearest_follow_up_date'],
            'days_until_follow_up': (row['nearest_follow_up_date'] - today).days if row['nearest_follow_up_date'] else None,
        } for row in rows]

        return Response({'success': True, 'data': {'patients': patients}})


class DoctorPatientDetailView(APIView):
    """This doctor's full history with one patient — never anything from the patient's account
    beyond what happened with THIS doctor specifically (other doctors' consultations, other
    orders, unrelated prescriptions are all out of reach here, enforced by scoping every query to
    doctor=doctor in addition to user_id). Returns 404 — not an empty-but-200 response — if this
    doctor has never actually had an appointment with this user, so a doctor can't distinguish
    "this user doesn't exist" from "this user exists but I've never seen them" by probing ids."""
    permission_classes = [IsDoctor]

    def get(self, request, user_id):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()

        appointments = (
            DoctorAppointment.objects.filter(doctor=doctor, user_id=user_id)
            .select_related('user')
            .prefetch_related(*APPOINTMENT_PRESCRIPTION_PREFETCH)
            .order_by('-scheduled_date')
        )
        if not appointments.exists():
            return Response({'success': False, 'message': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        patient_user = appointments.first().user
        prescriptions = Prescription.objects.filter(
            user_id=user_id, appointment__doctor=doctor,
        ).prefetch_related('medicine_items__medicine', 'lab_test_items__lab_test', 'lab_test_items__booking').order_by('-uploaded_at')

        prescriptions_data = []
        for presc in prescriptions:
            data = PrescriptionSerializer(presc).data
            data['medicine_items'] = PrescriptionMedicineItemSerializer(presc.medicine_items.all(), many=True).data
            data['lab_test_items'] = PrescriptionLabTestItemSerializer(presc.lab_test_items.all(), many=True).data
            prescriptions_data.append(data)

        # Reports this patient chose to send to this doctor. Scoped to doctor=doctor like everything
        # else here: a report exists on the platform the moment the lab uploads it, but it reaches a
        # doctor only through a share the patient made (LabReportShareView) — including reports for
        # tests this very doctor ordered.
        shared_reports = (
            LabReportShare.objects.filter(doctor=doctor, booking__user_id=user_id)
            .select_related('booking__lab_test', 'booking__user').order_by('-shared_at')
        )

        return Response({
            'success': True,
            'data': {
                'patient': {
                    'id': str(patient_user.id), 'full_name': patient_user.full_name,
                    'email': patient_user.email, 'phone': patient_user.phone,
                },
                'appointments': DoctorAppointmentSerializer(appointments, many=True, context={'request': request}).data,
                'prescriptions': prescriptions_data,
                'shared_reports': LabReportShareSerializer(shared_reports, many=True, context={'request': request}).data,
            },
        })


# ─── Pharmacy Dashboard (Stage 5 of the marketplace spec) ─────────────────────
#
# Every view below is gated by IsPharmacy (role-only) AND additionally scopes every query to the
# pharmacy resolved by get_managed_pharmacy() — the two together are what stop Pharmacy A from
# ever seeing or acting on Pharmacy B's listings/requests. IsPharmacy alone only proves "some
# pharmacy is logged in"; the ownership filter on each queryset/lookup is what proves "this
# pharmacy, not just any pharmacy."

def get_managed_pharmacy(user):
    """Resolves the Pharmacy a logged-in PHARMACY-role user acts for: either they ARE the owner
    (Pharmacy.user, the OneToOneField login identity) or they're one of that owner's up-to-3
    team members (PharmacyTeamMember.user). Returns None if neither applies (e.g. a team member
    who was since removed, but whose token is still valid)."""
    pharmacy = getattr(user, 'pharmacy', None)
    if pharmacy:
        return pharmacy
    membership = getattr(user, 'pharmacy_membership', None)
    return membership.pharmacy if membership else None


def _pharmacy_not_found_response():
    return Response({'success': False, 'message': 'No pharmacy is associated with this account.'}, status=status.HTTP_403_FORBIDDEN)


def _can_view_finance(user, pharmacy):
    """The owner can always see income/payout figures for their own pharmacy. A team member can
    only see them if the owner has explicitly granted PharmacyTeamMember.can_view_finance —
    defaults to False, since payout amounts are the kind of thing an owner may not want every
    staff login to see."""
    if pharmacy.user_id == user.id:
        return True
    membership = getattr(user, 'pharmacy_membership', None)
    return bool(membership and membership.can_view_finance)


class PharmacyProfileView(APIView):
    """Self-service profile + settings, including the online/offline switch. Any team member can
    edit this (operational, not sensitive like finance — same reasoning as inventory/orders access),
    scoped via get_managed_pharmacy() like everything else in this section."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        data = PharmacyProfileSerializer(pharmacy).data
        data['is_owner'] = pharmacy.user_id == request.user.id
        return Response({'success': True, 'data': {'pharmacy': data}})

    # Bank details determine where real payout money goes — unlike the rest of this profile,
    # editing them is owner-only (same reasoning as PharmacyTeamMember.can_view_finance
    # defaulting closed: a team member login shouldn't be able to redirect the pharmacy's payouts).
    OWNER_ONLY_FIELDS = ['bank_name', 'bank_account_holder_name', 'bank_account_number', 'bank_branch']

    def patch(self, request, *args, **kwargs):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        is_owner = pharmacy.user_id == request.user.id
        if not is_owner and any(f in request.data for f in self.OWNER_ONLY_FIELDS):
            return Response({'success': False, 'message': 'Only the pharmacy owner can update bank details.'}, status=status.HTTP_403_FORBIDDEN)

        # lat/lng deliberately absent, even for the owner — unlike bank details (owner-only, not
        # removed), the matching engine's 3km radius, the combined-pickup proximity checks, and
        # every customer-facing distance/ETA display all trust this value. A pharmacy repositioning
        # its own pin with zero oversight is a real trust/fraud surface, not just a self-service
        # nicety — only an admin can change it now, via AdminPharmacyDetailView.
        editable_fields = ['name', 'phone', 'address', 'is_active', 'contact_person_name', 'contact_person_phone']
        if is_owner:
            editable_fields += self.OWNER_ONLY_FIELDS
        update_fields = []
        for field in editable_fields:
            if field in request.data:
                setattr(pharmacy, field, request.data[field])
                update_fields.append(field)
        if update_fields:
            pharmacy.save(update_fields=update_fields)

        message = 'Profile updated.'
        if 'is_active' in update_fields:
            message = 'You are now receiving new requests.' if pharmacy.is_active else 'You are now offline — no new requests will be sent to you.'
        return Response({'success': True, 'data': {'pharmacy': PharmacyProfileSerializer(pharmacy).data}, 'message': message})


class PharmacyLocationChangeRequestView(APIView):
    """The reviewed path to actually move a pharmacy's pin, now that PharmacyProfileView.patch()
    locks lat/lng out of direct self-service edit. Owner-only, same reasoning as bank details —
    this determines where riders are sent and what the matching radius is measured from, not
    something a team member login should be able to set in motion unilaterally."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        if pharmacy.user_id != request.user.id:
            return Response({'success': False, 'message': 'Only the pharmacy owner can view location change requests.'}, status=status.HTTP_403_FORBIDDEN)

        latest = pharmacy.location_change_requests.order_by('-created_at').first()
        return Response({'success': True, 'data': {'request': PharmacyLocationChangeRequestSerializer(latest).data if latest else None}})

    def post(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        if pharmacy.user_id != request.user.id:
            return Response({'success': False, 'message': 'Only the pharmacy owner can request a location change.'}, status=status.HTTP_403_FORBIDDEN)

        if pharmacy.location_change_requests.filter(status='PENDING').exists():
            return Response({
                'success': False,
                'message': 'You already have a pending location change request — wait for it to be reviewed before submitting another.',
            }, status=status.HTTP_400_BAD_REQUEST)

        lat, lng = request.data.get('lat'), request.data.get('lng')
        if lat is None or lng is None:
            return Response({'success': False, 'message': 'lat and lng are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            return Response({'success': False, 'message': 'lat and lng must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        req = PharmacyLocationChangeRequest.objects.create(
            pharmacy=pharmacy, requested_lat=lat, requested_lng=lng,
            requested_address=request.data.get('address') or None,
            reason=request.data.get('reason') or None,
        )

        _notify_admins(
            'manage_pharmacies', 'PHARMACY_LOCATION_CHANGE_REQUEST', 'Location Change Requested',
            f'{pharmacy.name} requested a location change — review before it takes effect.',
            link=f'/admin/pharmacies/{pharmacy.id}',
        )

        return Response({
            'success': True, 'data': {'request': PharmacyLocationChangeRequestSerializer(req).data},
            'message': 'Location change requested — an admin will review it shortly.',
        }, status=status.HTTP_201_CREATED)


class PharmacyLogoUploadView(APIView):
    """Mirrors AvatarUploadView's pattern (local FileSystemStorage, same size/type limits) for the
    pharmacy's own logo/storefront photo."""
    permission_classes = [IsPharmacy]

    def post(self, request):
        from django.core.files.storage import FileSystemStorage

        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        file = request.FILES.get('logo')
        if not file:
            return Response({'success': False, 'message': 'No image file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or GIF images are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 3 * 1024 * 1024:
            return Response({'success': False, 'message': 'Image must be under 3MB.'}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower() or '.jpg'
        filename = f'pharmacy_{pharmacy.id}{ext}'
        storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'pharmacy_logos'))
        if storage.exists(filename):
            storage.delete(filename)
        storage.save(filename, file)

        pharmacy.logo_url = f'/media/pharmacy_logos/{filename}'
        pharmacy.save(update_fields=['logo_url'])
        return Response({'success': True, 'data': {'pharmacy': PharmacyProfileSerializer(pharmacy).data}, 'message': 'Logo updated.'})

    def delete(self, request):
        from django.core.files.storage import FileSystemStorage

        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        if pharmacy.logo_url:
            storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'pharmacy_logos'))
            filename = pharmacy.logo_url.rsplit('/', 1)[-1]
            if storage.exists(filename):
                storage.delete(filename)
        pharmacy.logo_url = None
        pharmacy.save(update_fields=['logo_url'])
        return Response({'success': True, 'message': 'Logo removed.'})


DOCUMENT_CONTENT_TYPES = ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')


def _document_max_size_bytes():
    """Admin-configurable via SystemSetting (document_max_size_mb, stored in MB) — read fresh at
    every call site rather than cached at import time."""
    return int(_get_setting('document_max_size_mb', '5')) * 1024 * 1024


def _save_pharmacy_document(pharmacy, doc_type, file, uploaded_by):
    """Shared upload mechanics for PharmacyDocumentView and AdminPharmacyDocumentView — the only
    real difference between the two is which doc_type values each is allowed to write and how the
    target pharmacy is resolved (self-service vs admin-supplied pk), both handled by the caller."""
    from django.core.files.storage import FileSystemStorage

    ext = os.path.splitext(file.name)[1].lower() or '.jpg'
    filename = f'{pharmacy.id}_{doc_type.lower()}{ext}'
    storage = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'pharmacy_documents'))
    if storage.exists(filename):
        storage.delete(filename)
    storage.save(filename, file)

    doc, _ = PharmacyDocument.objects.update_or_create(
        pharmacy=pharmacy, doc_type=doc_type,
        defaults={'file_url': f'/media/pharmacy_documents/{filename}', 'uploaded_by': uploaded_by},
    )
    return doc


class PharmacyDocumentView(APIView):
    """Self-service compliance-document upload for the pharmacy itself — PAN card, citizenship,
    and cancelled cheque (proof of their own bank account). Only the signed MOU is uploaded by the
    PharmaX team instead (AdminPharmacyDocumentView), since that one originates on PharmaX's side
    of the relationship."""
    permission_classes = [IsPharmacy]
    SELF_SERVICE_TYPES = ('PAN_CARD', 'CITIZENSHIP', 'CANCELLED_CHEQUE')

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        docs = pharmacy.documents.all()
        return Response({'success': True, 'data': {'documents': PharmacyDocumentSerializer(docs, many=True).data}})

    def post(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        doc_type = request.data.get('doc_type')
        if doc_type not in self.SELF_SERVICE_TYPES:
            return Response({'success': False, 'message': 'You can only upload a PAN card, citizenship, or cancelled cheque here.'}, status=status.HTTP_400_BAD_REQUEST)

        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if file.content_type not in DOCUMENT_CONTENT_TYPES:
            return Response({'success': False, 'message': 'Only JPG, PNG, WebP, or PDF files are allowed.'}, status=status.HTTP_400_BAD_REQUEST)
        max_size = _document_max_size_bytes()
        if file.size > max_size:
            return Response({'success': False, 'message': f'File must be under {max_size // (1024 * 1024)}MB.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = _save_pharmacy_document(pharmacy, doc_type, file, request.user)
        return Response({'success': True, 'data': {'document': PharmacyDocumentSerializer(doc).data}, 'message': 'Document uploaded.'})


class PharmacyBusinessHoursView(APIView):
    """Get/set the informational weekly schedule shown on the pharmacy's profile. Always returns
    exactly 7 rows (creating any missing weekday rows on first read) so the frontend never has to
    handle a partial week."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        existing_weekdays = set(pharmacy.business_hours.values_list('weekday', flat=True))
        missing = [wd for wd, _ in PharmacyBusinessHours.WEEKDAYS if wd not in existing_weekdays]
        if missing:
            PharmacyBusinessHours.objects.bulk_create([
                PharmacyBusinessHours(pharmacy=pharmacy, weekday=wd) for wd in missing
            ])

        hours = pharmacy.business_hours.order_by('weekday')
        return Response({'success': True, 'data': {'hours': PharmacyBusinessHoursSerializer(hours, many=True).data}})

    def put(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        rows = request.data.get('hours')
        if not isinstance(rows, list):
            return Response({'success': False, 'message': "'hours' must be a list of 7 day entries."}, status=status.HTTP_400_BAD_REQUEST)

        by_weekday = {}
        for row in rows:
            try:
                weekday = int(row['weekday'])
            except (KeyError, TypeError, ValueError):
                return Response({'success': False, 'message': 'Each entry needs a valid weekday.'}, status=status.HTTP_400_BAD_REQUEST)
            if weekday not in dict(PharmacyBusinessHours.WEEKDAYS):
                return Response({'success': False, 'message': f'Invalid weekday: {weekday}.'}, status=status.HTTP_400_BAD_REQUEST)
            by_weekday[weekday] = row

        with transaction.atomic():
            for weekday, row in by_weekday.items():
                PharmacyBusinessHours.objects.update_or_create(
                    pharmacy=pharmacy, weekday=weekday,
                    defaults={
                        'is_closed': bool(row.get('is_closed', False)),
                        'open_time': row.get('open_time') or None,
                        'close_time': row.get('close_time') or None,
                    },
                )

        hours = pharmacy.business_hours.order_by('weekday')
        return Response({'success': True, 'data': {'hours': PharmacyBusinessHoursSerializer(hours, many=True).data}, 'message': 'Business hours updated.'})


class PharmacyMedicineListView(APIView):
    """Browse the master Medicine catalog to decide what to carry — read-only, not scoped to any
    pharmacy (there's nothing to own here yet; PharmacyListingListView is where ownership starts)."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        qs = Medicine.objects.select_related('category', 'brand').order_by('name')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__name__icontains=search))

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(100, max(1, int(request.query_params.get('limit', 24))))
        except ValueError:
            page, limit = 1, 24

        total = qs.count()
        start = (page - 1) * limit
        medicines = qs[start:start + limit]

        return Response({
            'success': True,
            'data': {
                'medicines': MedicineListSerializer(medicines, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class PharmacyListingListView(APIView):
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        listings = PharmacyMedicineListing.objects.filter(
            pharmacy=pharmacy,
        ).select_related('medicine__category', 'medicine__brand').order_by('medicine__name')
        return Response({'success': True, 'data': {'listings': PharmacyListingSerializer(listings, many=True).data}})

    def post(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        s = PharmacyListingCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        try:
            medicine = Medicine.objects.get(id=d['medicine_id'])
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)

        # update_or_create keyed on pharmacy+medicine: unique_together already enforces one
        # listing per medicine per pharmacy, so re-submitting the same medicine just updates it.
        listing, created = PharmacyMedicineListing.objects.update_or_create(
            pharmacy=pharmacy, medicine=medicine,
            defaults={
                'stock_quantity': d['stock_quantity'],
                'expiry_date': d['expiry_date'],
                'is_available': d.get('is_available', True),
            },
        )
        return Response(
            {'success': True, 'data': {'listing': PharmacyListingSerializer(listing).data}, 'message': 'Listing saved.'},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PharmacyListingDetailView(APIView):
    permission_classes = [IsPharmacy]

    def patch(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        # the pharmacy=pharmacy filter on this lookup IS the ownership boundary — Pharmacy B (or
        # a team member not on this pharmacy) passing this listing id gets a 404, not someone
        # else's data.
        try:
            listing = PharmacyMedicineListing.objects.select_related('medicine').get(pk=pk, pharmacy=pharmacy)
        except PharmacyMedicineListing.DoesNotExist:
            return Response({'success': False, 'message': 'Listing not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'stock_quantity' in request.data:
            listing.stock_quantity = request.data['stock_quantity']
        if 'expiry_date' in request.data:
            listing.expiry_date = request.data['expiry_date']
        if 'is_available' in request.data:
            listing.is_available = bool(request.data['is_available'])
        listing.save()

        return Response({'success': True, 'data': {'listing': PharmacyListingSerializer(listing).data}, 'message': 'Listing updated.'})

    def delete(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        try:
            listing = PharmacyMedicineListing.objects.get(pk=pk, pharmacy=pharmacy)
        except PharmacyMedicineListing.DoesNotExist:
            return Response({'success': False, 'message': 'Listing not found.'}, status=status.HTTP_404_NOT_FOUND)
        listing.delete()
        return Response({'success': True, 'message': 'Stopped carrying this medicine.'})


class PharmacyRequestListView(APIView):
    """Incoming FulfillmentRequests still awaiting this pharmacy's response. Scoped to the
    resolved pharmacy — the query itself is the ownership boundary, there's no way to pass a
    filter that leaks another pharmacy's PENDING requests."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        # Polled every few seconds by every pharmacy's dashboard — the natural,
        # infrastructure-free trigger for widen_stale_priority_broadcasts() (see its docstring:
        # no real scheduler exists anywhere in this project). Called here so a pharmacy that only
        # qualifies once an order's full-coverage priority window has lapsed sees it on their very
        # next poll, not an arbitrary amount of time later. Same reasoning for
        # expire_stale_delivery_broadcasts() — this dashboard is exactly where an admin follow-up
        # notification about a stuck pickup would matter.
        widen_stale_priority_broadcasts()
        expire_stale_delivery_broadcasts()
        requests = FulfillmentRequest.objects.filter(
            pharmacy=pharmacy, status='PENDING',
        ).select_related('order_item__medicine', 'order_item__order__address').order_by('created_at')
        return Response({'success': True, 'data': {'requests': PharmacyFulfillmentRequestSerializer(requests, many=True).data}})


class PharmacyRequestAcceptView(APIView):
    permission_classes = [IsPharmacy]

    def post(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        # ownership check #1: the lookup itself. Another pharmacy (or a team member not on this
        # one) supplying this request id gets 404 here — the row simply doesn't match pharmacy=pharmacy.
        try:
            req = FulfillmentRequest.objects.select_related('order_item').get(pk=pk, pharmacy=pharmacy)
        except FulfillmentRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

        # ownership check #2 (defense in depth): pharmacy_accept_item() is called with the
        # resolved pharmacy, never anything client-supplied, so even if check #1 were somehow
        # bypassed there's no path to accept on another pharmacy's behalf.
        ok, err = pharmacy_accept_item(pharmacy, req.order_item)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Accepted — it will show up in your order history.'})


class PharmacyRequestDeclineView(APIView):
    permission_classes = [IsPharmacy]

    def post(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        try:
            req = FulfillmentRequest.objects.select_related('order_item').get(pk=pk, pharmacy=pharmacy)
        except FulfillmentRequest.DoesNotExist:
            return Response({'success': False, 'message': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = pharmacy_decline_item(pharmacy, req.order_item)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Declined.'})


class PharmacyDashboardStatsView(APIView):
    """Aggregates + the 5 most recent orders for the dashboard's stat cards. Computed via DB
    aggregation over the pharmacy's full order/listing history instead of fetching and
    serializing every fulfillment + listing just to reduce them to a handful of numbers — that
    full unpaginated fetch is what PharmacyOrderListView is for, needed by the Order History page
    for its client-side filters, but it has no place being pulled on every dashboard load."""
    permission_classes = [IsPharmacy]
    LOW_STOCK_THRESHOLD = 5
    ACTIVE_STATUSES = ['ACCEPTED', 'AWAITING_DELIVERY', 'OUT_FOR_DELIVERY']

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        show_finance = _can_view_finance(request.user, pharmacy)
        fulfillments = OrderFulfillment.objects.filter(pharmacy=pharmacy)
        active = fulfillments.filter(status__in=self.ACTIVE_STATUSES).count()
        delivered = fulfillments.filter(status='DELIVERED').count()

        pending_payout = total_paid = 0
        if show_finance:
            payouts = PharmacyPayout.objects.filter(pharmacy=pharmacy)
            pending_payout = payouts.filter(status='PENDING').aggregate(total=Sum('net_payable'))['total'] or 0
            total_paid = payouts.filter(status='PAID').aggregate(total=Sum('net_payable'))['total'] or 0

        low_stock = PharmacyMedicineListing.objects.filter(
            pharmacy=pharmacy, is_available=True, stock_quantity__lte=self.LOW_STOCK_THRESHOLD,
        ).count()

        recent = fulfillments.select_related(
            'order__address', 'delivery_agent__user', 'pharmacy_payout',
        ).prefetch_related('order_items__medicine', 'order_items__prescription').order_by('-accepted_at')[:5]
        recent_serializer = PharmacyOrderFulfillmentSerializer(recent, many=True, context={'show_finance': show_finance})

        return Response({
            'success': True,
            'data': {
                'show_finance': show_finance,
                'stats': {
                    'active': active,
                    'delivered': delivered,
                    'pending_payout': str(pending_payout),
                    'total_paid': str(total_paid),
                    'low_stock': low_stock,
                },
                'recent_orders': recent_serializer.data,
            },
        })


class PharmacyOrderListView(APIView):
    """This pharmacy's own OrderFulfillments (items it won) — scoped the same way as everything
    else here: filtered on the resolved pharmacy."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        fulfillments = OrderFulfillment.objects.filter(
            pharmacy=pharmacy,
        ).select_related(
            'order__address', 'delivery_agent__user', 'pharmacy_payout',
        ).prefetch_related('order_items__medicine', 'order_items__prescription').order_by('-accepted_at')
        show_finance = _can_view_finance(request.user, pharmacy)
        serializer = PharmacyOrderFulfillmentSerializer(fulfillments, many=True, context={'show_finance': show_finance})
        return Response({'success': True, 'data': {'orders': serializer.data, 'show_finance': show_finance}})


class PharmacyOrderAdvanceStatusView(APIView):
    """Manually advances one fulfillment through its prep stages — ACCEPTED -> PREPARED ->
    PACKED -> AWAITING_DELIVERY (broadcast to nearby riders). See
    matching.pharmacy_advance_fulfillment() for the actual sequencing/validation."""
    permission_classes = [IsPharmacy]

    def post(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        try:
            fulfillment = OrderFulfillment.objects.select_related('order').get(pk=pk, pharmacy=pharmacy)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = pharmacy_advance_fulfillment(pharmacy, fulfillment)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)

        fulfillment.refresh_from_db()
        show_finance = _can_view_finance(request.user, pharmacy)
        serializer = PharmacyOrderFulfillmentSerializer(fulfillment, context={'show_finance': show_finance})
        return Response({'success': True, 'data': {'order': serializer.data}, 'message': 'Status updated.'})


class PharmacyVerifyPickupView(APIView):
    """The pharmacy-side half of the pickup handoff security check: the rider recites/shows the
    4-digit code they were given on acceptance, staff types it in here. See
    matching.pharmacy_verify_pickup_code() for the actual validation and what it unlocks."""
    permission_classes = [IsPharmacy]

    def post(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        try:
            fulfillment = OrderFulfillment.objects.select_related('order').get(pk=pk, pharmacy=pharmacy)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        code = request.data.get('code')
        ok, err = pharmacy_verify_pickup_code(pharmacy, fulfillment, code)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)

        fulfillment.refresh_from_db()
        show_finance = _can_view_finance(request.user, pharmacy)
        serializer = PharmacyOrderFulfillmentSerializer(fulfillment, context={'show_finance': show_finance})
        return Response({'success': True, 'data': {'order': serializer.data}, 'message': 'Pickup verified.'})


class PharmacyVerifyPrescriptionView(APIView):
    """Lets the pharmacy that won an order verify (or reject) a prescription for its OWN slice,
    without waiting on an admin — see matching.pharmacy_review_prescription() for the per-pharmacy
    semantics and what a verify unblocks. Admin's global verify (AdminPrescriptionDetailView) still
    works in parallel and clears every pharmacy at once."""
    permission_classes = [IsPharmacy]

    def post(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()

        try:
            fulfillment = OrderFulfillment.objects.select_related('order').prefetch_related(
                'order_items__medicine', 'order_items__prescription',
            ).get(pk=pk, pharmacy=pharmacy)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        prescription_id = request.data.get('prescription_id')
        action = request.data.get('action')
        reason = (request.data.get('reason') or '').strip()
        if not prescription_id:
            return Response({'success': False, 'message': 'prescription_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, err = pharmacy_review_prescription(pharmacy, fulfillment, prescription_id, action, request.user, reason)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)

        # Re-fetch with prefetch (bulk_update + refresh_from_db dropped the cache) so the response's
        # get_items()/get_prescription_ready() serialize in constant queries.
        fulfillment = OrderFulfillment.objects.select_related(
            'order__address', 'delivery_agent__user', 'pharmacy_payout',
        ).prefetch_related('order_items__medicine', 'order_items__prescription').get(pk=pk)
        show_finance = _can_view_finance(request.user, pharmacy)
        serializer = PharmacyOrderFulfillmentSerializer(fulfillment, context={'show_finance': show_finance})
        return Response({'success': True, 'data': {'order': serializer.data}, 'message': 'Prescription updated.'})


class PharmacyOrderTrackingView(APIView):
    """Same shape as OrderTrackingView/AdminOrderTrackingView, but `pk` here is the ORDER id (not
    a fulfillment id, unlike PharmacyOrderAdvanceStatusView above) — filtered to only this
    pharmacy's own leg(s) of that order, so a split order's OTHER pharmacy's fulfillment never
    shows up here, same ownership boundary as every other pharmacy-scoped endpoint."""
    permission_classes = [IsPharmacy]

    def get(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        fulfillments = OrderFulfillment.objects.filter(order_id=pk, pharmacy=pharmacy).select_related(
            'pharmacy', 'delivery_agent__user', 'order__address',
        ).prefetch_related('order_items__medicine', 'order_items__prescription')
        if not fulfillments.exists():
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'fulfillments': [_tracking_payload(f) for f in fulfillments]}})


class PharmacyTeamListView(APIView):
    """List + add team members. Any team member can view (transparency into who else can act on
    requests); only the owner (Pharmacy.user) can add new ones, capped at 3 beyond the owner."""
    permission_classes = [IsPharmacy]
    MAX_TEAM_MEMBERS = 3

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        members = pharmacy.team_members.select_related('user').order_by('created_at')
        return Response({
            'success': True,
            'data': {
                'is_owner': pharmacy.user_id == request.user.id,
                'owner': {'full_name': pharmacy.user.full_name, 'email': pharmacy.user.email},
                'members': PharmacyTeamMemberSerializer(members, many=True).data,
                'max_members': self.MAX_TEAM_MEMBERS,
                # whether the CALLER themselves can see income/payout figures — owner always can;
                # lets any consumer (e.g. the dashboard's finance cards) decide what to render
                # without re-deriving the owner/membership logic client-side.
                'my_finance_access': _can_view_finance(request.user, pharmacy),
            },
        })

    def post(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        if pharmacy.user_id != request.user.id:
            return Response({'success': False, 'message': 'Only the pharmacy owner can add team members.'}, status=status.HTTP_403_FORBIDDEN)

        if pharmacy.team_members.count() >= self.MAX_TEAM_MEMBERS:
            return Response({'success': False, 'message': f'You can add up to {self.MAX_TEAM_MEMBERS} team members.'}, status=status.HTTP_400_BAD_REQUEST)

        s = PharmacyTeamMemberCreateSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        d = s.validated_data

        with transaction.atomic():
            user = User.objects.create_user(
                email=d['email'], full_name=d['full_name'], phone=d['phone'], password=d['password'],
                role='PHARMACY', is_active=True, is_email_verified=True,
            )
            member = PharmacyTeamMember.objects.create(
                pharmacy=pharmacy, user=user, can_view_finance=d.get('can_view_finance', False),
            )

        # Same split as the owner onboarding above: password only in the one-time email, never in
        # the persistent in-app notification. Links to the pharmacy dashboard they can now act in.
        Notification.objects.create(
            user=user, type='ACCOUNT_UPDATE', title=f'You’ve been added to {pharmacy.name}',
            message=f'You can now sign in and help manage orders for {pharmacy.name}.',
            link='/pharmacy',
        )
        send_pharmacy_welcome_email(user, d['password'], pharmacy_name=pharmacy.name)

        return Response(
            {'success': True, 'data': {'member': PharmacyTeamMemberSerializer(member).data}, 'message': 'Team member added.'},
            status=status.HTTP_201_CREATED,
        )


class PharmacyTeamMemberDetailView(APIView):
    permission_classes = [IsPharmacy]

    def patch(self, request, pk):
        # currently only used to grant/revoke finance visibility — owner-only, same as add/remove.
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        if pharmacy.user_id != request.user.id:
            return Response({'success': False, 'message': 'Only the pharmacy owner can change team member access.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            member = PharmacyTeamMember.objects.select_related('user').get(pk=pk, pharmacy=pharmacy)
        except PharmacyTeamMember.DoesNotExist:
            return Response({'success': False, 'message': 'Team member not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'can_view_finance' in request.data:
            member.can_view_finance = bool(request.data['can_view_finance'])
            member.save(update_fields=['can_view_finance'])

        return Response({'success': True, 'data': {'member': PharmacyTeamMemberSerializer(member).data}, 'message': 'Team member updated.'})

    def delete(self, request, pk):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        if pharmacy.user_id != request.user.id:
            return Response({'success': False, 'message': 'Only the pharmacy owner can remove team members.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            member = PharmacyTeamMember.objects.select_related('user').get(pk=pk, pharmacy=pharmacy)
        except PharmacyTeamMember.DoesNotExist:
            return Response({'success': False, 'message': 'Team member not found.'}, status=status.HTTP_404_NOT_FOUND)

        # deactivate rather than hard-delete the User — keeps their name/history intact on any
        # requests/orders they actioned while active, mirrors how admin suspends other accounts.
        with transaction.atomic():
            member.user.is_active = False
            member.user.save(update_fields=['is_active'])
            member.delete()

        return Response({'success': True, 'message': 'Team member removed.'})


# ─── Delivery Dashboard (Stage 6 of the marketplace spec) ─────────────────────
#
# Same ownership discipline as the pharmacy views above, with one structural difference worth
# noting: there's no per-agent request row (Stage 4 deliberately didn't add one — see
# broadcast_delivery()'s docstring), so "ownership" before acceptance isn't a row to filter by,
# it's a live eligibility check (_agent_eligible_for(), reused here rather than reimplemented).
# Any eligible agent can legitimately see/accept the same AWAITING_DELIVERY fulfillment — that's
# correct first-accept-wins behavior, not a leak, mirroring how two pharmacies can both see the
# same broadcast order in Stage 2. Ownership starts existing only once a fulfillment has a
# delivery_agent — GET /delivery/active/, collect-cash, and mark-delivered all filter on
# delivery_agent=request.user.delivery_agent, the same FK-filter pattern as Stage 5.

PRE_PICKUP_STATUSES = ('ACCEPTED', 'PREPARED', 'PACKED', 'AWAITING_DELIVERY')


class DeliveryFinanceView(APIView):
    """The rider's own combined financial profile — both ledgers at once, same shape as
    AdminAgentFinanceProfileView above but self-scoped (no `agent` param, filtered to
    request.user.delivery_agent) and read-only: confirming a COD remittance stays an
    admin-only action (see AdminCodLiabilityConfirmRemittanceView) since a rider self-marking
    cash they still owe as 'remitted' would defeat the point of the ledger."""
    permission_classes = [IsDeliveryAgent]

    def get(self, request):
        agent = request.user.delivery_agent

        liabilities = DeliveryAgentCodLiability.objects.filter(agent=agent).select_related('fulfillment__order', 'confirmed_by').order_by('-created_at')
        earnings = DeliveryAgentEarning.objects.filter(agent=agent).select_related('fulfillment__order', 'paid_by').order_by('-created_at')

        pending_liabilities = liabilities.filter(status='PENDING')
        total_collected = liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        total_outstanding = pending_liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        oldest_pending = pending_liabilities.order_by('created_at').first()
        oldest_age_days = (timezone.now() - oldest_pending.created_at).days if oldest_pending else None

        total_earned = earnings.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_pending_earnings = earnings.filter(status='PENDING').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_paid_earnings = earnings.filter(status='PAID').aggregate(t=Sum('amount'))['t'] or Decimal('0')

        return Response({
            'success': True,
            'data': {
                'cod_record': {
                    'liabilities': AdminDeliveryAgentCodLiabilitySerializer(liabilities, many=True).data,
                    'total_collected': str(total_collected),
                    'total_outstanding': str(total_outstanding),
                    'oldest_unremitted_age_days': oldest_age_days,
                },
                'earnings_record': {
                    'earnings': AdminDeliveryAgentEarningSerializer(earnings, many=True).data,
                    'total_earned': str(total_earned),
                    'total_pending': str(total_pending_earnings),
                    'total_paid': str(total_paid_earnings),
                },
            },
        })


class DeliveryRequestListView(APIView):
    """Available-to-accept, unclaimed deliveries — every fulfillment this specific agent currently
    qualifies for, per the same live eligibility check delivery_agent_accept() uses.

    Rider dispatch happens as soon as an order is PLACED (see broadcast_delivery()'s docstring),
    well before a pharmacy has necessarily finished packing — so this now includes any non-claimed
    fulfillment from ACCEPTED through AWAITING_DELIVERY, not just AWAITING_DELIVERY. delivery_agent
    __isnull=True is what "not yet claimed" means now — status alone no longer tells you that,
    since a fulfillment can sit in any of these stages either with or without a rider already
    assigned (see _maybe_finalize_pickup()). Excludes anything this agent has already declined
    (see DeliveryDecline) — still visible to every other eligible agent."""
    permission_classes = [IsDeliveryAgent]

    def get(self, request):
        agent = request.user.delivery_agent
        # Polled every few seconds by every online rider looking for jobs — the natural trigger
        # for expire_stale_delivery_broadcasts() (see PharmacyRequestListView for the same
        # reasoning re: widen_stale_priority_broadcasts()).
        expire_stale_delivery_broadcasts()
        candidates = OrderFulfillment.objects.filter(
            status__in=PRE_PICKUP_STATUSES, delivery_broadcast_at__isnull=False, delivery_agent__isnull=True,
        ).exclude(declines__agent=agent).select_related('pharmacy', 'order__address').prefetch_related('order_items__medicine', 'order_items__prescription')
        eligible = [f for f in candidates if _agent_eligible_for(agent, f)]
        return Response({'success': True, 'data': {'requests': DeliveryFulfillmentSerializer(eligible, many=True).data}})


class DeliveryRequestAcceptView(APIView):
    permission_classes = [IsDeliveryAgent]

    def post(self, request, pk):
        try:
            fulfillment = OrderFulfillment.objects.get(pk=pk, status__in=PRE_PICKUP_STATUSES)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery not found or no longer available.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = delivery_agent_accept(request.user.delivery_agent, fulfillment)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Accepted! Head to the pharmacy for pickup.'})


class DeliveryRequestDeclineView(APIView):
    """Lets a rider say "not this one" — see DeliveryDecline's docstring for why a per-agent record
    is what's actually needed here (there's no request row to flip, unlike Stage 2's pharmacy
    decline). Records the decline for every sibling fulfillment on the same order at once, since a
    combined pickup is declined as a whole, not leg by leg."""
    permission_classes = [IsDeliveryAgent]

    def post(self, request, pk):
        try:
            fulfillment = OrderFulfillment.objects.get(pk=pk, status__in=PRE_PICKUP_STATUSES, delivery_agent__isnull=True)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery not found or no longer available.'}, status=status.HTTP_404_NOT_FOUND)

        agent = request.user.delivery_agent
        sibling_ids = OrderFulfillment.objects.filter(order_id=fulfillment.order_id).exclude(status='CANCELLED').values_list('id', flat=True)
        DeliveryDecline.objects.bulk_create(
            [DeliveryDecline(agent=agent, fulfillment_id=fid) for fid in sibling_ids],
            ignore_conflicts=True,
        )
        return Response({'success': True, 'message': 'Declined.'})


class DeliveryActiveListView(APIView):
    """This agent's own active deliveries — scoped by delivery_agent=request.user.delivery_agent,
    the ownership boundary that only exists once a fulfillment has actually been won.

    Includes the pre-pickup statuses now too, not just OUT_FOR_DELIVERY — a rider can be committed
    to a job well before it's physically ready (see delivery_agent_accept()/_maybe_finalize_pickup()),
    and needs to see it here (not just in Requests) once they've accepted it."""
    permission_classes = [IsDeliveryAgent]

    def get(self, request):
        fulfillments = OrderFulfillment.objects.filter(
            delivery_agent=request.user.delivery_agent, status__in=(*PRE_PICKUP_STATUSES, 'OUT_FOR_DELIVERY'),
        ).select_related('order__address', 'pharmacy').prefetch_related('order_items__medicine', 'order_items__prescription').order_by('accepted_at')
        return Response({'success': True, 'data': {'deliveries': DeliveryActiveSerializer(fulfillments, many=True).data}})


class DeliveryCollectCashView(APIView):
    permission_classes = [IsDeliveryAgent]

    def post(self, request, pk):
        # the delivery_agent=request.user.delivery_agent filter on this lookup IS the ownership
        # boundary — Agent B passing Agent A's fulfillment id gets a 404, not someone else's delivery.
        try:
            fulfillment = OrderFulfillment.objects.select_related('order').get(pk=pk, delivery_agent=request.user.delivery_agent)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = collect_cash(fulfillment)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Cash collected — delivery complete.'})


class DeliveryMarkDeliveredView(APIView):
    permission_classes = [IsDeliveryAgent]

    def post(self, request, pk):
        try:
            fulfillment = OrderFulfillment.objects.select_related('order').get(pk=pk, delivery_agent=request.user.delivery_agent)
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = mark_delivered(fulfillment)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Marked as delivered.'})


class DeliveryLocationUpdateView(APIView):
    """No pk in the URL at all — this always operates on request.user.delivery_agent, so there's
    no id a rider could even supply to target another agent's location."""
    permission_classes = [IsDeliveryAgent]

    def patch(self, request):
        lat, lng = request.data.get('lat'), request.data.get('lng')
        if lat is None or lng is None:
            return Response({'success': False, 'message': 'lat and lng are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            return Response({'success': False, 'message': 'lat and lng must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        update_agent_location(request.user.delivery_agent, lat, lng)
        return Response({'success': True, 'message': 'Location updated.'})


class DeliveryOnlineToggleView(APIView):
    """Lets a rider go online/offline — the actual toggle the DeliveryAgent.is_online field's own
    comment ("agent toggles this to receive requests at all") always assumed existed. It never
    did: is_online defaulted to False at signup and nothing anywhere ever flipped it, so no rider
    could ever appear in broadcast_delivery()/_agent_eligible_for() regardless of location or
    verification. Same no-pk-in-URL pattern as DeliveryLocationUpdateView — always operates on
    request.user.delivery_agent."""
    permission_classes = [IsDeliveryAgent]

    def patch(self, request):
        is_online = request.data.get('is_online')
        if not isinstance(is_online, bool):
            return Response({'success': False, 'message': 'is_online (boolean) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        agent = request.user.delivery_agent
        agent.is_online = is_online
        agent.save(update_fields=['is_online'])
        return Response({
            'success': True,
            'data': {'is_online': agent.is_online},
            'message': 'You are now online.' if is_online else 'You are now offline.',
        })


# ─── Lab Collector Dashboard (lab sample collection spec) ─────────────────────
#
# Same two patterns as the delivery dashboard throughout: IsCollector (role-only) gates access,
# and every query is additionally scoped to request.user.lab_collector / collector=... — that
# second filter is the actual ownership boundary, IsCollector alone only proves "some collector is
# logged in." There's no browse/accept here — a collector only ever sees bookings admin has
# already assigned them (AdminLabTestBookingAssignCollectorView).

class LabCollectorActiveListView(APIView):
    """This collector's own active collections — assigned but not yet reported. The booking stays
    in this list through every in-progress status (en route, arrived, sample collected, submitted to
    lab); once REPORT_READY there's nothing further for the collector to do, so that's excluded here
    (still visible via the booking's own history), as is CANCELLED."""
    permission_classes = [IsCollector]

    def get(self, request):
        bookings = LabTestBooking.objects.filter(
            collector=request.user.lab_collector,
            status__in=('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB'),
        ).select_related('lab_test__category', 'address', 'user', 'collector__user').order_by('scheduled_date')
        return Response({'success': True, 'data': {'collections': LabTestBookingSerializer(bookings, many=True).data}})


class LabCollectorHistoryView(APIView):
    """This collector's finished collections — the terminal counterpart to the active list: the jobs
    that have dropped out of it because there's nothing left to do. REPORT_READY (completed — the
    same set the dashboard's "Completed" stat counts) and CANCELLED. Same IsCollector +
    collector=request.user.lab_collector ownership boundary; most-recent first so the latest work
    sits at the top. context={'request': request} so report_file_url resolves to an absolute,
    downloadable link (the active list omits it because in-progress bookings have no report yet)."""
    permission_classes = [IsCollector]

    def get(self, request):
        bookings = LabTestBooking.objects.filter(
            collector=request.user.lab_collector,
            status__in=('REPORT_READY', 'CANCELLED'),
        ).select_related('lab_test__category', 'address', 'user', 'collector__user').order_by('-scheduled_date', '-updated_at')
        return Response({'success': True, 'data': {'collections': LabTestBookingSerializer(bookings, many=True, context={'request': request}).data}})


class LabCollectorConfirmCollectedView(APIView):
    permission_classes = [IsCollector]

    def post(self, request, pk):
        # the collector=request.user.lab_collector filter on this lookup IS the ownership
        # boundary — Collector B passing Collector A's booking id gets a 404, not someone else's job.
        try:
            booking = LabTestBooking.objects.get(pk=pk, collector=request.user.lab_collector)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = collector_confirm_sample_collected(request.user.lab_collector, booking, request.data.get('amount_confirmed'))
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'message': 'Sample collection confirmed.'})


# The three progress steps below share the shape of LabCollectorConfirmCollectedView: the
# collector=request.user.lab_collector filter on the lookup IS the ownership boundary (a mismatched
# id 404s), then the transition helper enforces the source-status guard. They refresh_from_db before
# serializing because the helpers mutate a separate select_for_update() row, leaving the fetched
# instance stale — so the response reflects the real new status the frontend can reconcile against.

class LabCollectorEnRouteView(APIView):
    permission_classes = [IsCollector]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(pk=pk, collector=request.user.lab_collector)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = collector_mark_en_route(request.user.lab_collector, booking)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        booking.refresh_from_db()
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Marked on the way.'})


class LabCollectorArrivedView(APIView):
    permission_classes = [IsCollector]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(pk=pk, collector=request.user.lab_collector)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = collector_mark_arrived(request.user.lab_collector, booking)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        booking.refresh_from_db()
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Marked arrived.'})


class LabCollectorSubmittedToLabView(APIView):
    permission_classes = [IsCollector]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(pk=pk, collector=request.user.lab_collector)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        ok, err = collector_mark_submitted_to_lab(request.user.lab_collector, booking)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        booking.refresh_from_db()
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Marked submitted to lab.'})


class LabCollectorReportUploadView(APIView):
    permission_classes = [IsCollector]

    def post(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(pk=pk, collector=request.user.lab_collector)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)

        file = request.FILES.get('file')
        if not file:
            return Response({'success': False, 'message': 'A report file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        ok, err = _upload_lab_report(booking, file)
        if not ok:
            return Response({'success': False, 'message': err}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Report uploaded.'})


class LabCollectorLocationUpdateView(APIView):
    """No pk in the URL at all — always operates on request.user.lab_collector, same pattern as
    DeliveryLocationUpdateView."""
    permission_classes = [IsCollector]

    def patch(self, request):
        lat, lng = request.data.get('lat'), request.data.get('lng')
        if lat is None or lng is None:
            return Response({'success': False, 'message': 'lat and lng are required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            return Response({'success': False, 'message': 'lat and lng must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        collector = request.user.lab_collector
        collector.lat = lat
        collector.lng = lng
        collector.save(update_fields=['lat', 'lng'])
        return Response({'success': True, 'message': 'Location updated.'})


class LabCollectorOnlineToggleView(APIView):
    permission_classes = [IsCollector]

    def patch(self, request):
        is_online = request.data.get('is_online')
        if not isinstance(is_online, bool):
            return Response({'success': False, 'message': 'is_online (boolean) is required.'}, status=status.HTTP_400_BAD_REQUEST)

        collector = request.user.lab_collector
        collector.is_online = is_online
        collector.save(update_fields=['is_online'])
        return Response({
            'success': True,
            'data': {'is_online': collector.is_online},
            'message': 'You are now online.' if is_online else 'You are now offline.',
        })


class LabCollectorFinanceView(APIView):
    """The collector's own combined financial profile — same shape as DeliveryFinanceView, and
    same reasoning: confirming a COD remittance stays admin-only (see
    AdminCollectorCodLiabilityConfirmRemittanceView) since a collector self-marking cash they still
    owe as 'remitted' would defeat the point of the ledger."""
    permission_classes = [IsCollector]

    def get(self, request):
        collector = request.user.lab_collector

        liabilities = CollectorCodLiability.objects.filter(collector=collector).select_related('booking__lab_test', 'confirmed_by').order_by('-created_at')
        earnings = CollectorEarning.objects.filter(collector=collector).select_related('booking__lab_test', 'paid_by').order_by('-created_at')

        pending_liabilities = liabilities.filter(status='PENDING')
        total_collected = liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        total_outstanding = pending_liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        oldest_pending = pending_liabilities.order_by('created_at').first()
        oldest_age_days = (timezone.now() - oldest_pending.created_at).days if oldest_pending else None

        total_earned = earnings.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_pending_earnings = earnings.filter(status='PENDING').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_paid_earnings = earnings.filter(status='PAID').aggregate(t=Sum('amount'))['t'] or Decimal('0')

        return Response({
            'success': True,
            'data': {
                'cod_record': {
                    'liabilities': AdminCollectorCodLiabilitySerializer(liabilities, many=True).data,
                    'total_collected': str(total_collected),
                    'total_outstanding': str(total_outstanding),
                    'oldest_unremitted_age_days': oldest_age_days,
                },
                'earnings_record': {
                    'earnings': AdminCollectorEarningSerializer(earnings, many=True).data,
                    'total_earned': str(total_earned),
                    'total_pending': str(total_pending_earnings),
                    'total_paid': str(total_paid_earnings),
                },
            },
        })


class LabCollectorDashboardView(APIView):
    """At-a-glance landing for a collector — the counts and money figures that drive their day,
    scoped to request.user.lab_collector. Same aggregation approach as LabCollectorFinanceView
    (Count/Sum over the collector's own rows); no money is computed here that isn't already recorded
    elsewhere — this only surfaces it."""
    permission_classes = [IsCollector]

    def get(self, request):
        collector = request.user.lab_collector
        bookings = LabTestBooking.objects.filter(collector=collector)

        to_collect = bookings.filter(status__in=('CONFIRMED', 'EN_ROUTE', 'ARRIVED')).count()
        awaiting_report = bookings.filter(status__in=('SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB')).count()
        completed = bookings.filter(status='REPORT_READY').count()
        today_count = bookings.filter(
            scheduled_date=timezone.localdate(),
        ).exclude(status__in=('CANCELLED', 'REPORT_READY')).count()

        earnings_pending = CollectorEarning.objects.filter(
            collector=collector, status='PENDING',
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        cod_outstanding = CollectorCodLiability.objects.filter(
            collector=collector, status='PENDING',
        ).aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')

        # The still-actionable bookings, soonest first — the same set the active list shows.
        upcoming = bookings.filter(
            status__in=('CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB'),
        ).select_related('lab_test__category', 'address', 'user', 'collector__user').order_by('scheduled_date')[:3]

        return Response({
            'success': True,
            'data': {
                'is_online': collector.is_online,
                'is_verified': collector.is_verified,
                'stats': {
                    'to_collect': to_collect,
                    'awaiting_report': awaiting_report,
                    'completed': completed,
                    'today_count': today_count,
                    'earnings_pending': str(earnings_pending),
                    'cod_outstanding': str(cod_outstanding),
                },
                'upcoming': LabTestBookingSerializer(upcoming, many=True, context={'request': request}).data,
            },
        })


# ─── Admin: Finance / Settlement Ledgers (Stage 8 of the financial ledger spec) ────
#
# All gated by manage_finance, same permission AdminWalletListView/AdminWalletAdjustView already
# use — no new permission code needed for this stage.

class AdminPharmacyPayoutListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        qs = PharmacyPayout.objects.select_related('pharmacy', 'fulfillment__order', 'paid_by').order_by('-created_at')
        pharmacy_id = request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        funding_source = request.query_params.get('funding_source')
        if funding_source:
            qs = qs.filter(funding_source=funding_source)

        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        payouts = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'payouts': AdminPharmacyPayoutSerializer(payouts, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminPharmacyPayoutMarkPaidView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request, pk):
        try:
            payout = PharmacyPayout.objects.get(pk=pk)
        except PharmacyPayout.DoesNotExist:
            return Response({'success': False, 'message': 'Payout not found.'}, status=status.HTTP_404_NOT_FOUND)
        if payout.status == 'PAID':
            return Response({'success': False, 'message': 'This payout is already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        payout.status = 'PAID'
        payout.paid_at = timezone.now()
        payout.paid_by = request.user
        payout.save(update_fields=['status', 'paid_at', 'paid_by'])
        return Response({'success': True, 'data': {'payout': AdminPharmacyPayoutSerializer(payout).data}, 'message': 'Marked as paid.'})


# ─── Pharmacy Incentive Campaigns ───────────────────────────────────────────────
#
# Gated by manage_pharmacies (not a new permission code) since this is pharmacy-domain admin work,
# the same reasoning AdminLabCollectorListView etc. already use for their own domain.

class AdminCampaignListView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def get(self, request):
        campaigns = PharmacyIncentiveCampaign.objects.select_related('created_by').order_by('-created_at')
        return Response({'success': True, 'data': {'campaigns': PharmacyIncentiveCampaignSerializer(campaigns, many=True).data}})

    def post(self, request):
        s = PharmacyIncentiveCampaignSerializer(data=request.data)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        campaign = s.save(created_by=request.user)
        return Response({'success': True, 'data': {'campaign': PharmacyIncentiveCampaignSerializer(campaign).data}}, status=status.HTTP_201_CREATED)


class AdminCampaignDetailView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def put(self, request, pk):
        try:
            campaign = PharmacyIncentiveCampaign.objects.get(id=pk)
        except PharmacyIncentiveCampaign.DoesNotExist:
            return Response({'success': False, 'message': 'Campaign not found.'}, status=status.HTTP_404_NOT_FOUND)
        s = PharmacyIncentiveCampaignSerializer(campaign, data=request.data, partial=True)
        if not s.is_valid():
            return Response({'success': False, 'errors': s.errors}, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({'success': True, 'data': {'campaign': s.data}})

    def delete(self, request, pk):
        try:
            campaign = PharmacyIncentiveCampaign.objects.get(id=pk)
        except PharmacyIncentiveCampaign.DoesNotExist:
            return Response({'success': False, 'message': 'Campaign not found.'}, status=status.HTTP_404_NOT_FOUND)
        campaign.delete()
        return Response({'success': True, 'message': 'Campaign deleted.'})


class AdminCampaignEnrollView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def post(self, request, pk):
        try:
            campaign = PharmacyIncentiveCampaign.objects.get(id=pk)
        except PharmacyIncentiveCampaign.DoesNotExist:
            return Response({'success': False, 'message': 'Campaign not found.'}, status=status.HTTP_404_NOT_FOUND)
        pharmacy_id = request.data.get('pharmacy_id')
        if not pharmacy_id:
            return Response({'success': False, 'message': 'pharmacy_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            pharmacy = Pharmacy.objects.get(id=pharmacy_id)
        except Pharmacy.DoesNotExist:
            return Response({'success': False, 'message': 'Pharmacy not found.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            enrollment = PharmacyCampaignEnrollment.objects.create(campaign=campaign, pharmacy=pharmacy, enrolled_by=request.user)
        except IntegrityError:
            return Response({'success': False, 'message': f'{pharmacy.name} is already enrolled in this campaign.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'data': {'enrollment': PharmacyCampaignEnrollmentSerializer(enrollment).data}, 'message': f'{pharmacy.name} enrolled.'}, status=status.HTTP_201_CREATED)


class AdminCampaignMarkBonusPaidView(APIView):
    permission_classes = [require_permission('manage_pharmacies')]

    def post(self, request, pk):
        try:
            enrollment = PharmacyCampaignEnrollment.objects.select_related('campaign', 'pharmacy').get(id=pk)
        except PharmacyCampaignEnrollment.DoesNotExist:
            return Response({'success': False, 'message': 'Enrollment not found.'}, status=status.HTTP_404_NOT_FOUND)
        if enrollment.campaign.campaign_type != 'BONUS':
            return Response({'success': False, 'message': 'Only a BONUS campaign enrollment can be marked paid — this one is a DISCOUNT campaign, which has nothing to pay out.'}, status=status.HTTP_400_BAD_REQUEST)
        if enrollment.bonus_paid:
            return Response({'success': False, 'message': 'This bonus was already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        enrollment.bonus_paid = True
        enrollment.bonus_paid_at = timezone.now()
        enrollment.save(update_fields=['bonus_paid', 'bonus_paid_at'])
        return Response({'success': True, 'data': {'enrollment': PharmacyCampaignEnrollmentSerializer(enrollment).data}, 'message': 'Bonus marked as paid.'})


class PharmacyCampaignListView(APIView):
    """This pharmacy's own enrollments — active and past — so they can actually see what they've
    been enrolled in rather than just experiencing an unexplained commission-rate change."""
    permission_classes = [IsPharmacy]

    def get(self, request):
        pharmacy = get_managed_pharmacy(request.user)
        if not pharmacy:
            return _pharmacy_not_found_response()
        enrollments = PharmacyCampaignEnrollment.objects.filter(pharmacy=pharmacy).select_related('campaign').order_by('-enrolled_at')
        return Response({'success': True, 'data': {'enrollments': PharmacyCampaignEnrollmentSerializer(enrollments, many=True).data}})


class AdminAgentEarningListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        qs = DeliveryAgentEarning.objects.select_related('agent__user', 'fulfillment__order', 'paid_by').order_by('-created_at')
        agent_id = request.query_params.get('agent')
        if agent_id:
            qs = qs.filter(agent_id=agent_id)
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        earnings = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'earnings': AdminDeliveryAgentEarningSerializer(earnings, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminAgentEarningMarkPaidView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request, pk):
        try:
            earning = DeliveryAgentEarning.objects.get(pk=pk)
        except DeliveryAgentEarning.DoesNotExist:
            return Response({'success': False, 'message': 'Earning not found.'}, status=status.HTTP_404_NOT_FOUND)
        if earning.status == 'PAID':
            return Response({'success': False, 'message': 'This earning is already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        earning.status = 'PAID'
        earning.paid_at = timezone.now()
        earning.paid_by = request.user
        earning.save(update_fields=['status', 'paid_at', 'paid_by'])
        return Response({'success': True, 'data': {'earning': AdminDeliveryAgentEarningSerializer(earning).data}, 'message': 'Marked as paid.'})


class AdminCodLiabilityListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        qs = DeliveryAgentCodLiability.objects.select_related('agent__user', 'fulfillment__order', 'confirmed_by').order_by('-created_at')
        agent_id = request.query_params.get('agent')
        if agent_id:
            qs = qs.filter(agent_id=agent_id)
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        liabilities = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'liabilities': AdminDeliveryAgentCodLiabilitySerializer(liabilities, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminCodLiabilityConfirmRemittanceView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request, pk):
        try:
            liability = DeliveryAgentCodLiability.objects.get(pk=pk)
        except DeliveryAgentCodLiability.DoesNotExist:
            return Response({'success': False, 'message': 'Liability not found.'}, status=status.HTTP_404_NOT_FOUND)
        if liability.status == 'REMITTED':
            return Response({'success': False, 'message': 'This liability is already remitted.'}, status=status.HTTP_400_BAD_REQUEST)

        method = request.data.get('remittance_method')
        valid_methods = dict(DeliveryAgentCodLiability.METHOD)
        if method not in valid_methods:
            return Response({'success': False, 'message': f'remittance_method must be one of: {", ".join(valid_methods)}.'}, status=status.HTTP_400_BAD_REQUEST)

        liability.status = 'REMITTED'
        liability.remittance_method = method
        liability.reference = (request.data.get('reference') or '').strip() or None
        liability.remitted_at = timezone.now()
        liability.confirmed_by = request.user
        liability.save(update_fields=['status', 'remittance_method', 'reference', 'remitted_at', 'confirmed_by'])
        return Response({'success': True, 'data': {'liability': AdminDeliveryAgentCodLiabilitySerializer(liability).data}, 'message': 'Remittance confirmed.'})


# Collector-scoped mirror of the four delivery-agent finance views immediately above — same
# manage_finance gate, same pagination/filter shape, just CollectorEarning/CollectorCodLiability
# instead of DeliveryAgentEarning/DeliveryAgentCodLiability.

class AdminCollectorEarningListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        qs = CollectorEarning.objects.select_related('collector__user', 'booking__lab_test', 'paid_by').order_by('-created_at')
        collector_id = request.query_params.get('collector')
        if collector_id:
            qs = qs.filter(collector_id=collector_id)
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        earnings = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'earnings': AdminCollectorEarningSerializer(earnings, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminCollectorEarningMarkPaidView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request, pk):
        try:
            earning = CollectorEarning.objects.get(pk=pk)
        except CollectorEarning.DoesNotExist:
            return Response({'success': False, 'message': 'Earning not found.'}, status=status.HTTP_404_NOT_FOUND)
        if earning.status == 'PAID':
            return Response({'success': False, 'message': 'This earning is already marked paid.'}, status=status.HTTP_400_BAD_REQUEST)

        earning.status = 'PAID'
        earning.paid_at = timezone.now()
        earning.paid_by = request.user
        earning.save(update_fields=['status', 'paid_at', 'paid_by'])
        return Response({'success': True, 'data': {'earning': AdminCollectorEarningSerializer(earning).data}, 'message': 'Marked as paid.'})


class AdminCollectorCodLiabilityListView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        qs = CollectorCodLiability.objects.select_related('collector__user', 'booking__lab_test', 'confirmed_by').order_by('-created_at')
        collector_id = request.query_params.get('collector')
        if collector_id:
            qs = qs.filter(collector_id=collector_id)
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        total = qs.count()
        liabilities = qs[(page - 1) * limit: page * limit]
        return Response({
            'success': True,
            'data': {
                'liabilities': AdminCollectorCodLiabilitySerializer(liabilities, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminCollectorCodLiabilityConfirmRemittanceView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def post(self, request, pk):
        try:
            liability = CollectorCodLiability.objects.get(pk=pk)
        except CollectorCodLiability.DoesNotExist:
            return Response({'success': False, 'message': 'Liability not found.'}, status=status.HTTP_404_NOT_FOUND)
        if liability.status == 'REMITTED':
            return Response({'success': False, 'message': 'This liability is already remitted.'}, status=status.HTTP_400_BAD_REQUEST)

        method = request.data.get('remittance_method')
        valid_methods = dict(CollectorCodLiability.METHOD)
        if method not in valid_methods:
            return Response({'success': False, 'message': f'remittance_method must be one of: {", ".join(valid_methods)}.'}, status=status.HTTP_400_BAD_REQUEST)

        liability.status = 'REMITTED'
        liability.remittance_method = method
        liability.reference = (request.data.get('reference') or '').strip() or None
        liability.remitted_at = timezone.now()
        liability.confirmed_by = request.user
        liability.save(update_fields=['status', 'remittance_method', 'reference', 'remitted_at', 'confirmed_by'])
        return Response({'success': True, 'data': {'liability': AdminCollectorCodLiabilitySerializer(liability).data}, 'message': 'Remittance confirmed.'})


class AdminAgentFinanceProfileView(APIView):
    """The combined per-agent financial profile — both ledgers together, since reviewing one
    agent almost always means wanting both sides at once: what they owe the platform (COD
    liabilities) and what the platform owes them (earnings)."""
    permission_classes = [require_permission('manage_finance')]

    def get(self, request, pk):
        try:
            agent = DeliveryAgent.objects.select_related('user').get(pk=pk)
        except DeliveryAgent.DoesNotExist:
            return Response({'success': False, 'message': 'Delivery agent not found.'}, status=status.HTTP_404_NOT_FOUND)

        liabilities = DeliveryAgentCodLiability.objects.filter(agent=agent).select_related('fulfillment__order', 'confirmed_by').order_by('-created_at')
        earnings = DeliveryAgentEarning.objects.filter(agent=agent).select_related('fulfillment__order', 'paid_by').order_by('-created_at')

        pending_liabilities = liabilities.filter(status='PENDING')
        total_collected = liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        total_outstanding = pending_liabilities.aggregate(t=Sum('amount_collected'))['t'] or Decimal('0')
        oldest_pending = pending_liabilities.order_by('created_at').first()
        oldest_age_days = (timezone.now() - oldest_pending.created_at).days if oldest_pending else None

        total_earned = earnings.aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_pending_earnings = earnings.filter(status='PENDING').aggregate(t=Sum('amount'))['t'] or Decimal('0')
        total_paid_earnings = earnings.filter(status='PAID').aggregate(t=Sum('amount'))['t'] or Decimal('0')

        return Response({
            'success': True,
            'data': {
                'agent': AdminDeliveryAgentSerializer(agent).data,
                'cod_record': {
                    'liabilities': AdminDeliveryAgentCodLiabilitySerializer(liabilities, many=True).data,
                    'total_collected': str(total_collected),
                    'total_outstanding': str(total_outstanding),
                    'oldest_unremitted_age_days': oldest_age_days,
                },
                'earnings_record': {
                    'earnings': AdminDeliveryAgentEarningSerializer(earnings, many=True).data,
                    'total_earned': str(total_earned),
                    'total_pending': str(total_pending_earnings),
                    'total_paid': str(total_paid_earnings),
                },
            },
        })


class AdminFinanceSummaryView(APIView):
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        total_commission = PharmacyPayout.objects.aggregate(t=Sum('commission_amount'))['t'] or Decimal('0')

        pending_payouts = PharmacyPayout.objects.filter(status='PENDING')
        pending_payout_order_revenue = pending_payouts.filter(funding_source='ORDER_REVENUE').aggregate(t=Sum('net_payable'))['t'] or Decimal('0')
        pending_payout_platform_funds = pending_payouts.filter(funding_source='PLATFORM_FUNDS').aggregate(t=Sum('net_payable'))['t'] or Decimal('0')

        pending_agent_earnings = DeliveryAgentEarning.objects.filter(status='PENDING').aggregate(t=Sum('amount'))['t'] or Decimal('0')

        outstanding_rows = list(
            DeliveryAgentCodLiability.objects.filter(status='PENDING')
            .values('agent_id', 'agent__user__full_name')
            .annotate(total=Sum('amount_collected'))
            .order_by('-total')
        )
        outstanding_cod_by_agent = [
            {'agent_id': str(r['agent_id']), 'agent_name': r['agent__user__full_name'], 'amount': str(r['total'])}
            for r in outstanding_rows
        ]
        total_outstanding_cod = sum((r['total'] for r in outstanding_rows), Decimal('0'))

        month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        coupon_cost_this_month = CouponUsage.objects.filter(used_at__gte=month_start).aggregate(t=Sum('discount_amount'))['t'] or Decimal('0')

        # Gross revenue collected on the two service channels (PAID only). Surfaced here so the lab
        # Khalti payment the super admin was missing actually appears in Finance, alongside orders.
        lab_test_revenue = LabTestBooking.objects.filter(payment_status='PAID').aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
        appointment_revenue = DoctorAppointment.objects.filter(payment_status='PAID').aggregate(t=Sum('fee_charged'))['t'] or Decimal('0')

        return Response({
            'success': True,
            'data': {
                'total_commission_earned': str(total_commission),
                'pending_pharmacy_payouts': {
                    'order_revenue': str(pending_payout_order_revenue),
                    'platform_funds': str(pending_payout_platform_funds),
                },
                'pending_agent_earnings': str(pending_agent_earnings),
                'outstanding_cod': {
                    'total': str(total_outstanding_cod),
                    'by_agent': outstanding_cod_by_agent,
                },
                'coupon_cost_this_month': str(coupon_cost_this_month),
                'lab_test_revenue': str(lab_test_revenue),
                'appointment_revenue': str(appointment_revenue),
            },
        })


# --- Revenue by business line (Medicine / Lab / Appointments) ---------------
# Gross uses PAID rows (matches AdminReportsView.order_revenue exactly: payment_status='PAID',
# no lifecycle-status filter). Costs are summed in full with NO payout-status filter and NO
# order join — the same accrual basis as total_commission_earned above: a PharmacyPayout /
# DeliveryAgentEarning / CollectorEarning / DoctorPayout row exists once the work is settled,
# and in practice that lines up with the revenue flipping to PAID (COD flips to PAID at the
# same moment its payout is created; online was already PAID). Timing caveat by design: an
# online order paid but not yet delivered shows gross with no matching cost yet, and a Plus-free
# appointment (fee_charged=0, NOT_REQUIRED) contributes zero gross but a real DoctorPayout —
# a deliberate loss captured by summing all payouts. No coupon/wallet re-subtraction: Order
# .total_amount is already net of both.

def _medicine_channel_totals():
    gross = Order.objects.filter(payment_status='PAID').aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
    pharmacy_cost = PharmacyPayout.objects.aggregate(t=Sum('net_payable'))['t'] or Decimal('0')
    agent_cost = DeliveryAgentEarning.objects.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    cost_total = pharmacy_cost + agent_cost
    count = Order.objects.filter(payment_status='PAID').count()
    return {
        'key': 'medicine', 'label': 'Medicine Orders',
        'gross': str(gross),
        'cost_breakdown': {'pharmacy_payouts': str(pharmacy_cost), 'delivery_earnings': str(agent_cost)},
        'cost_total': str(cost_total), 'net': str(gross - cost_total), 'count': count,
    }


def _lab_channel_totals():
    gross = LabTestBooking.objects.filter(payment_status='PAID').aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
    collector_cost = CollectorEarning.objects.aggregate(t=Sum('amount'))['t'] or Decimal('0')
    count = LabTestBooking.objects.filter(payment_status='PAID').count()
    return {
        'key': 'lab-tests', 'label': 'Lab Tests',
        'gross': str(gross),
        'cost_breakdown': {'collector_earnings': str(collector_cost)},
        'cost_total': str(collector_cost), 'net': str(gross - collector_cost), 'count': count,
    }


def _appointment_channel_totals():
    gross = DoctorAppointment.objects.filter(payment_status='PAID').aggregate(t=Sum('fee_charged'))['t'] or Decimal('0')
    doctor_cost = DoctorPayout.objects.aggregate(t=Sum('net_payable'))['t'] or Decimal('0')
    count = DoctorAppointment.objects.filter(payment_status='PAID').count()
    return {
        'key': 'appointments', 'label': 'Doctor Appointments',
        'gross': str(gross),
        'cost_breakdown': {'doctor_payouts': str(doctor_cost)},
        'cost_total': str(doctor_cost), 'net': str(gross - doctor_cost), 'count': count,
    }


class AdminFinanceChannelsView(APIView):
    """Gross + net-after-costs for each business line. Powers the Finance dashboard breakdown."""
    permission_classes = [require_permission('manage_finance')]

    def get(self, request):
        channels = [_medicine_channel_totals(), _lab_channel_totals(), _appointment_channel_totals()]
        totals = {
            'gross': str(sum((Decimal(c['gross']) for c in channels), Decimal('0'))),
            'cost_total': str(sum((Decimal(c['cost_total']) for c in channels), Decimal('0'))),
            'net': str(sum((Decimal(c['net']) for c in channels), Decimal('0'))),
        }
        return Response({'success': True, 'data': {'channels': channels, 'totals': totals}})


class AdminFinanceChannelDetailView(APIView):
    """One business line: its P&L header + a paginated list of the PAID revenue rows behind it."""
    permission_classes = [require_permission('manage_finance')]

    def get(self, request, channel):
        page = max(1, int(request.query_params.get('page', 1)))
        limit = min(50, int(request.query_params.get('limit', 20)))
        status_filter = request.query_params.get('status')  # lifecycle status, per channel; optional

        if channel == 'medicine':
            header = _medicine_channel_totals()
            qs = (Order.objects.filter(payment_status='PAID')
                  .select_related('user').prefetch_related('items__medicine').order_by('-placed_at'))
            if status_filter:
                qs = qs.filter(status=status_filter)
            serializer_cls = AdminChannelOrderSerializer
        elif channel == 'lab-tests':
            header = _lab_channel_totals()
            qs = (LabTestBooking.objects.filter(payment_status='PAID')
                  .select_related('user', 'lab_test').order_by('-booked_at'))
            if status_filter:
                qs = qs.filter(status=status_filter)
            serializer_cls = AdminChannelLabBookingSerializer
        elif channel == 'appointments':
            header = _appointment_channel_totals()
            qs = (DoctorAppointment.objects.filter(payment_status='PAID')
                  .select_related('user', 'doctor').order_by('-booked_at'))
            if status_filter:
                qs = qs.filter(status=status_filter)
            serializer_cls = AdminChannelAppointmentSerializer
        else:
            return Response({'success': False, 'message': 'Unknown revenue channel.'}, status=status.HTTP_404_NOT_FOUND)

        total = qs.count()
        rows = serializer_cls(qs[(page - 1) * limit: page * limit], many=True).data
        return Response({
            'success': True,
            'data': {
                'channel': header,
                'transactions': rows,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminFinanceDailyView(APIView):
    """Day-wise gross revenue (PAID rows) across the three channels, with an optional
    payment-method filter (COD / Khalti / eSewa) and a date range — the "track day-wise
    finance, see the total for all the days, filter by COD/Khalti/eSewa" view.

    Grain is a single day; rows are grouped by each transaction's own placed/booked date
    (Order.placed_at, LabTestBooking.booked_at, DoctorAppointment.booked_at) in the server's
    local timezone. These revenue rows carry no separate paid_at, so "finance per day" means
    the day the (paid) transaction was booked — the same date basis the channel drill-downs
    order by. Gross is defined exactly as the Revenue-by-Channel cards: PAID rows only, summing
    Order/Lab total_amount and Appointment fee_charged.

    COD spans BOTH spellings — 'CASH_ON_DELIVERY' (main order/lab flows) and the bare 'COD' the
    subscription auto-refill writes. Doctor appointments have no COD option (KHALTI/ESEWA/WALLET),
    so a COD filter naturally contributes nothing from that channel; a WALLET appointment counts
    only under the unfiltered (all-methods) view.
    """
    permission_classes = [require_permission('manage_finance')]

    # (key, model, amount field summed for gross, timestamp field, label)
    CHANNELS = [
        ('medicine', Order, 'total_amount', 'placed_at', 'Medicine Orders'),
        ('lab-tests', LabTestBooking, 'total_amount', 'booked_at', 'Lab Tests'),
        ('appointments', DoctorAppointment, 'fee_charged', 'booked_at', 'Doctor Appointments'),
    ]
    # UI filter value -> the payment_method strings it matches. Absence => no method filter.
    METHOD_FILTERS = {
        'COD': ('CASH_ON_DELIVERY', 'COD'),
        'KHALTI': ('KHALTI',),
        'ESEWA': ('ESEWA',),
    }

    def get(self, request):
        today = timezone.localdate()
        date_from = parse_date(request.query_params.get('date_from') or '') or (today - timedelta(days=29))
        date_to = parse_date(request.query_params.get('date_to') or '') or today
        if date_from > date_to:
            date_from, date_to = date_to, date_from

        method = (request.query_params.get('payment_method') or '').strip().upper()
        method_values = self.METHOD_FILTERS.get(method)  # None => every method

        channel_filter = (request.query_params.get('channel') or '').strip()
        channels = [c for c in self.CHANNELS if not channel_filter or c[0] == channel_filter]

        by_day = {}          # date -> {'gross': Decimal, 'count': int, 'channels': {key: gross-str}}
        channel_totals = {}  # key  -> {'key','label','gross','count'} for the whole range
        for key, model, amount_field, ts_field, label in channels:
            qs = model.objects.filter(**{
                'payment_status': 'PAID',
                f'{ts_field}__date__gte': date_from,
                f'{ts_field}__date__lte': date_to,
            })
            if method_values is not None:
                qs = qs.filter(payment_method__in=method_values)
            rows = (qs.annotate(day=TruncDate(ts_field))
                      .values('day')
                      .annotate(gross=Sum(amount_field), count=Count('id')))
            ch_gross, ch_count = Decimal('0'), 0
            for r in rows:
                gross = r['gross'] or Decimal('0')
                slot = by_day.setdefault(r['day'], {'gross': Decimal('0'), 'count': 0, 'channels': {}})
                slot['gross'] += gross
                slot['count'] += r['count']
                slot['channels'][key] = str(gross)
                ch_gross += gross
                ch_count += r['count']
            channel_totals[key] = {'key': key, 'label': label, 'gross': str(ch_gross), 'count': ch_count}

        days = [
            {'date': d.isoformat(), 'gross': str(v['gross']), 'count': v['count'], 'channels': v['channels']}
            for d, v in sorted(by_day.items(), reverse=True)
        ]
        total_gross = sum((v['gross'] for v in by_day.values()), Decimal('0'))
        total_count = sum((v['count'] for v in by_day.values()), 0)

        return Response({
            'success': True,
            'data': {
                'days': days,
                'total': {'gross': str(total_gross), 'count': total_count},
                'channel_totals': [channel_totals[c[0]] for c in channels],
                'filters': {
                    'date_from': date_from.isoformat(),
                    'date_to': date_to.isoformat(),
                    'payment_method': method if method_values is not None else '',
                    'channel': channel_filter if any(c[0] == channel_filter for c in self.CHANNELS) else '',
                },
            },
        })
