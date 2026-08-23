import hmac
import hashlib
import base64
import calendar
import json
import os
import random
import uuid as uuid_lib
import requests
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q, Avg, Count, Sum, F, ProtectedError
from django.db import transaction
from django.http import HttpResponseRedirect
from django.conf import settings
from decimal import Decimal

from .models import (
    User, Address, Category, Brand, Medicine, Prescription, PrescriptionMedicineItem, PrescriptionFile,
    Cart, CartItem, Order, OrderItem, Review, WishlistItem,
    Notification, SystemSetting, StockLog,
    LabTestCategory, LabTest, LabTestBooking, BlogPost, MedicineSubscription, Doctor, DoctorAvailability, DoctorAppointment, DoctorPayout,
    PlusPlan, PlusMembership, DoctorReview, HealthRecord, MedicineReminder, ReminderLog,
    Coupon, CouponUsage, Wallet, WalletTransaction, Referral, Permission,
    Pharmacy, DeliveryAgent, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, DeliveryDecline,
    PharmacyPayout, DeliveryAgentEarning, DeliveryAgentCodLiability, PharmacyTeamMember, PharmacyBusinessHours,
    PharmacyDocument, PharmacyLocationChangeRequest,
)
from .serializers import (
    RegisterSerializer, OTPVerifySerializer, ResendOTPSerializer,
    LoginSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    CategorySerializer, BrandSerializer, MedicineListSerializer, MedicineDetailSerializer,
    AddressSerializer, PrescriptionSerializer, PrescriptionMedicineItemSerializer, CartSerializer,
    CartItemSerializer, OrderSerializer, ReviewSerializer, MyReviewSerializer,
    NotificationSerializer, StockLogSerializer, SystemSettingSerializer,
    LabTestCategorySerializer, LabTestListSerializer, LabTestDetailSerializer, LabTestBookingSerializer,
    BlogPostListSerializer, BlogPostDetailSerializer, MedicineSubscriptionSerializer,
    DoctorSerializer, DoctorAvailabilitySerializer, DoctorAppointmentSerializer,
    DoctorPayoutSerializer, AdminDoctorPayoutSerializer,
    AdminDoctorSerializer, AdminDoctorCreateSerializer, AdminDoctorLinkAccountSerializer,
    PlusPlanSerializer, PlusMembershipSerializer,
    DoctorReviewSerializer, MyDoctorReviewSerializer, HealthRecordSerializer,
    MedicineReminderSerializer, ReminderLogSerializer,
    CouponSerializer, WalletSerializer, WalletTransactionSerializer, ReferralSerializer,
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
)
from .utils import generate_otp, send_otp_email_async, get_store_name
from .permissions import IsAdmin, IsSuperAdmin, IsPharmacy, IsDeliveryAgent, IsDoctor, require_permission
from .throttles import AuthRateThrottle
from .matching import (
    broadcast_order, sync_order_status, expire_stale_fulfillment_requests, expire_stale_delivery_broadcasts,
    pharmacy_accept_item, pharmacy_decline_item, pharmacy_advance_fulfillment, pharmacy_verify_pickup_code,
    delivery_agent_accept, update_agent_location, collect_cash, mark_delivered, _agent_eligible_for,
    _tracking_payload, widen_stale_priority_broadcasts, _fulfillment_prescription_ready, broadcast_delivery,
)
from .scheduling import get_available_slots

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
            'store_name': settings_map.get('store_name') or 'PharmaX',
            'support_email': settings_map.get('support_email'),
            'support_phone': settings_map.get('support_phone'),
        }})


# ─── Categories ───────────────────────────────────────────────────────────────

class CategoryListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        categories = Category.objects.filter(is_active=True).order_by('name')
        return Response({'success': True, 'data': {'categories': CategorySerializer(categories, many=True).data}})


# ─── Medicines ────────────────────────────────────────────────────────────────

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

        sort_map = {
            'popular': '-total_reviews',
            'price-asc': 'price',
            'price-desc': '-price',
            'rating': '-rating',
            'newest': '-created_at',
            'name': 'name',
        }
        qs = qs.order_by(sort_map.get(sort, '-total_reviews'))

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(100, max(1, int(request.query_params.get('limit', 12))))
        except ValueError:
            page, limit = 1, 12

        total = qs.count()
        start = (page - 1) * limit
        medicines = qs[start:start + limit]

        return Response({
            'success': True,
            'data': {
                'medicines': MedicineListSerializer(medicines, many=True).data,
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
        try:
            medicine = Medicine.objects.select_related('category', 'brand').get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = MedicineDetailSerializer(medicine).data
        data['has_purchased'] = _user_has_purchased(request.user, medicine)
        return Response({'success': True, 'data': {'medicine': data}})


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

        rating = request.data.get('rating')
        comment = request.data.get('comment', '')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        review, created = Review.objects.update_or_create(
            user=request.user, medicine=medicine,
            defaults={'rating': int(rating), 'comment': comment},
        )
        _recalc_medicine_rating(medicine)
        if created:
            _notify_admins('manage_inventory', 'NEW_REVIEW', 'New Product Review',
                            f'{request.user.full_name} left a {rating}-star review on {medicine.name}.', link='/admin/medicines')

        return Response({'success': True, 'data': {'review': ReviewSerializer(review, context={'request': request}).data}}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def put(self, request, pk):
        if not request.user.is_authenticated:
            return Response({'success': False, 'message': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            review = Review.objects.get(medicine_id=pk, user=request.user)
        except Review.DoesNotExist:
            return Response({'success': False, 'message': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)

        rating = request.data.get('rating')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        review.rating = int(rating)
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
    """Notifies every admin who holds `permission_code`, plus every super admin."""
    admins = User.objects.filter(role='ADMIN', is_active=True).filter(
        Q(is_super_admin=True) | Q(permissions__code=permission_code)
    ).distinct()
    Notification.objects.bulk_create([
        Notification(user=admin, type=notif_type, title=title, message=message, link=link)
        for admin in admins
    ])


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

    Notification.objects.create(
        user=referral.referrer, type='REFERRAL', title='Referral Bonus Earned!',
        message=f'You earned NPR {referrer_bonus} because {user.full_name} placed their first order.',
        link='/referrals',
    )
    Notification.objects.create(
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

    Notification.objects.create(
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
                    Notification.objects.create(
                        user=fulfillment.pharmacy.user, type='ORDER_CANCELLED', title='Order Cancelled',
                        message=f'The customer cancelled order #{str(order.id)[:8]} — no need to prepare it further.',
                        link='/pharmacy/orders',
                    )
                if fulfillment.delivery_agent_id:
                    Notification.objects.create(
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
        rating = request.data.get('order_rating')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=pk, user=request.user, status='DELIVERED')
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Delivered order not found.'}, status=status.HTTP_404_NOT_FOUND)

        order.order_rating = int(rating)
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
        rating = request.data.get('rider_rating')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fulfillment = OrderFulfillment.objects.get(
                id=pk, order__user=request.user, status='DELIVERED', delivery_agent__isnull=False,
            )
        except OrderFulfillment.DoesNotExist:
            return Response({'success': False, 'message': 'Delivered fulfillment with a rider not found.'}, status=status.HTTP_404_NOT_FOUND)

        fulfillment.rider_rating = int(rating)
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

    Notification.objects.create(
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
                'purchase_order_name': f'PharmaX Order #{str(order.id)[-8:].upper()}',
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
                'purchase_order_name': f'PharmaX Consultation with Dr. {appt.doctor.name}',
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
            appt.status = 'CONFIRMED'
            appt.save(update_fields=['payment_status', 'status'])
            Notification.objects.create(
                user=appt.user, type='PAYMENT_UPDATE', title='Payment Received',
                message=f'Payment for your consultation with Dr. {appt.doctor.name} was received — your appointment is confirmed.',
                link=f'/doctor-consult/appointments/{appt.id}',
            )
            _notify_admins(
                'manage_doctors', 'PAYMENT_UPDATE', 'Appointment Payment Received',
                f'Payment received for {appt.user.full_name}\'s appointment with Dr. {appt.doctor.name} (NPR {appt.fee_charged}).',
                link='/admin/doctor-consult',
            )
        return HttpResponseRedirect(f'{FRONTEND_URL}/doctor-consult/payment-confirmation?appointmentId={appt.id}')


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
            test = LabTest.objects.select_related('category').get(id=pk, is_active=True)
        except LabTest.DoesNotExist:
            return Response({'success': False, 'message': 'Lab test not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'labTest': LabTestDetailSerializer(test).data}})


TIME_SLOTS = ['6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '4:00 PM - 6:00 PM', '6:00 PM - 8:00 PM']


class LabTestBookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        bookings = LabTestBooking.objects.filter(user=request.user).select_related('lab_test__category', 'address').order_by('-booked_at')
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

        booking = LabTestBooking.objects.create(
            user=request.user,
            lab_test=lab_test,
            address=address,
            scheduled_date=s.validated_data['scheduled_date'],
            time_slot=s.validated_data['time_slot'],
            total_amount=lab_test.price,
            notes=s.validated_data.get('notes'),
        )
        lab_test.total_bookings = F('total_bookings') + 1
        lab_test.save(update_fields=['total_bookings'])

        _notify_admins(
            'manage_lab_tests', 'NEW_LAB_BOOKING', 'New Lab Test Booking',
            f'{request.user.full_name} booked {lab_test.name} for {booking.scheduled_date}.',
            link='/admin/lab-tests',
        )

        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Lab test booked!'}, status=status.HTTP_201_CREATED)


class LabTestBookingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            booking = LabTestBooking.objects.select_related('lab_test__category', 'address').get(id=pk, user=request.user)
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
        if booking.status in ('SAMPLE_COLLECTED', 'REPORT_READY', 'CANCELLED'):
            return Response({'success': False, 'message': f'Cannot cancel a booking that is {booking.status.replace("_", " ").lower()}.'}, status=status.HTTP_400_BAD_REQUEST)
        booking.status = 'CANCELLED'
        booking.save(update_fields=['status'])
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Booking cancelled.'})


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
        qs = Doctor.objects.filter(is_active=True)
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
        return Response({'success': True, 'data': {'doctors': DoctorSerializer(qs, many=True).data}})


class DoctorSpecialtyListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        specialties = list(Doctor.objects.filter(is_active=True).values_list('specialty', flat=True).distinct().order_by('specialty'))
        return Response({'success': True, 'data': {'specialties': specialties}})


class DoctorDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.get(id=pk, is_active=True)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'doctor': DoctorSerializer(doctor).data}})


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
        appts = DoctorAppointment.objects.filter(user=request.user).select_related('doctor').order_by('-booked_at')
        return Response({'success': True, 'data': {'appointments': DoctorAppointmentSerializer(appts, many=True).data}})

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

        # PharmaX Plus members get every consultation free; the doctor is still paid their normal
        # share (see DoctorPayout) — PharmaX absorbs the discount as a Plus perk. Non-Plus bookings
        # stay PENDING (not yet confirmed) until payment clears.
        is_plus_free = _has_active_plus(request.user)
        if is_plus_free:
            fee_charged, payment_status_value, initial_status = Decimal('0'), 'NOT_REQUIRED', 'CONFIRMED'
        else:
            fee_charged, payment_status_value, initial_status = doctor.consultation_fee, 'PENDING', 'PENDING'

        appt = DoctorAppointment.objects.create(
            user=request.user,
            doctor=doctor,
            scheduled_date=scheduled_date,
            time_slot=time_slot,
            status=initial_status,
            fee_amount=doctor.consultation_fee,
            fee_charged=fee_charged,
            is_plus_free=is_plus_free,
            payment_status=payment_status_value,
            reason=s.validated_data.get('reason'),
        )
        doctor.total_consultations = F('total_consultations') + 1
        doctor.save(update_fields=['total_consultations'])

        _notify_admins(
            'manage_doctors', 'NEW_APPOINTMENT', 'New Doctor Appointment',
            f'{request.user.full_name} booked an appointment with Dr. {doctor.name} for {appt.scheduled_date}.',
            link='/admin/doctor-consult',
        )

        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt).data}, 'message': 'Appointment booked!'}, status=status.HTTP_201_CREATED)


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
        appt.status = 'CANCELLED'
        appt.save(update_fields=['status'])
        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt).data}, 'message': 'Appointment cancelled.'})


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

        rating = request.data.get('rating')
        comment = request.data.get('comment', '')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        review, created = DoctorReview.objects.update_or_create(
            user=request.user, doctor=doctor,
            defaults={'rating': int(rating), 'comment': comment},
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

        rating = request.data.get('rating')
        if not rating or not (1 <= int(rating) <= 5):
            return Response({'success': False, 'message': 'Rating must be between 1 and 5.'}, status=status.HTTP_400_BAD_REQUEST)

        review.rating = int(rating)
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

        Notification.objects.create(
            user=request.user,
            type='PLUS',
            title='Welcome to PharmaX Plus!',
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
        Notification.objects.create(
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
        total_revenue = Order.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        total_customers = User.objects.filter(role='CUSTOMER', is_deleted=False).count()
        total_medicines = Medicine.objects.count()
        pending_prescriptions = Prescription.objects.filter(status='PENDING').count()
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

        total_revenue = Order.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        monthly_revenue = Order.objects.filter(payment_status='PAID', placed_at__gte=start_of_month).aggregate(s=Sum('total_amount'))['s'] or 0
        total_orders = Order.objects.exclude(status__in=FAILED_STATUSES).count()
        cancelled_count = Order.objects.filter(status='CANCELLED').count()
        total_customers = User.objects.filter(role='CUSTOMER', is_deleted=False).count()
        pending_prescriptions = Prescription.objects.filter(status='PENDING').count()

        order_status_counts = list(
            Order.objects.exclude(status='CANCELLED').values('status').annotate(count=Count('id')).order_by('-count')
        )
        payment_method_counts = list(
            Order.objects.exclude(status='CANCELLED').exclude(payment_method__isnull=True)
            .values('payment_method').annotate(count=Count('id')).order_by('-count')
        )

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
        monthly_trend = [monthly_map[k] for k in sorted(monthly_map.keys())]

        return Response({
            'success': True,
            'data': {
                'total_revenue': float(total_revenue),
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
        qs = LabTest.objects.select_related('category').order_by('-created_at')
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
            test = LabTest.objects.select_related('category').get(id=pk)
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


class AdminLabTestBookingListView(APIView):
    permission_classes = [require_permission('manage_lab_tests')]

    def get(self, request):
        qs = LabTestBooking.objects.select_related('user', 'lab_test', 'address').order_by('-booked_at')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
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
    permission_classes = [require_permission('manage_lab_tests')]

    def put(self, request, pk):
        try:
            booking = LabTestBooking.objects.get(id=pk)
        except LabTestBooking.DoesNotExist:
            return Response({'success': False, 'message': 'Booking not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status and new_status not in dict(LabTestBooking.STATUS):
            return Response({'success': False, 'message': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)
        if new_status:
            booking.status = new_status
        if 'report_url' in request.data:
            booking.report_url = request.data.get('report_url') or None
        booking.save()
        return Response({'success': True, 'data': {'booking': LabTestBookingSerializer(booking).data}, 'message': 'Booking updated.'})


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

        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Doctor account created — remember to verify it before it can accept appointments.'}, status=status.HTTP_201_CREATED)


class AdminDoctorDetailView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request, pk):
        try:
            doctor = Doctor.objects.select_related('user').get(id=pk)
        except Doctor.DoesNotExist:
            return Response({'success': False, 'message': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}})

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

        return Response({'success': True, 'data': {'doctor': AdminDoctorSerializer(doctor).data}, 'message': 'Login account linked.'}, status=status.HTTP_201_CREATED)


class AdminAppointmentListView(APIView):
    permission_classes = [require_permission('manage_doctors')]

    def get(self, request):
        qs = DoctorAppointment.objects.select_related('user', 'doctor', 'payout').order_by('-booked_at')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        data = DoctorAppointmentSerializer(qs, many=True).data
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
        data = DoctorAppointmentSerializer(appt).data
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
        Notification.objects.create(
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
            still_needs_review = any(
                item.medicine.type == 'Rx' and (not item.prescription or item.prescription.status != 'VERIFIED')
                for item in order.items.all()
            )
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
            Notification.objects.create(
                user=order.user, type='ORDER', title='Prescription Verified',
                message=f'Your prescription was verified — order #{short_id} can now be prepared by the pharmacy.',
                link=f'/orders/{order.id}',
            )
        else:
            Notification.objects.create(
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

        item_count = prescription.medicine_items.count() if new_status == 'VERIFIED' else 0
        if item_count:
            message = f'Your prescription has been verified — we found {item_count} medicine(s). Review and add them to your cart.'
            link = f'/prescriptions/{prescription.id}/review'
        else:
            message = f'Your prescription has been {new_status.lower()}.' + (f' Reason: {rejection_reason}' if rejection_reason else '')
            link = None
        if admin_comment:
            message += f' Note from pharmacist: {admin_comment}'
        Notification.objects.create(
            user=prescription.user,
            type='PRESCRIPTION',
            title='Prescription ' + new_status.capitalize(),
            message=message,
            link=link,
        )

        _notify_prescription_order_outcome(prescription, new_status)

        return Response({'success': True, 'data': {'prescription': PrescriptionSerializer(prescription).data}})


class AdminPrescriptionMedicineItemListView(APIView):
    permission_classes = [require_permission('manage_prescriptions')]

    def post(self, request, pk):
        try:
            prescription = Prescription.objects.get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if prescription.status != 'PENDING':
            return Response({'success': False, 'message': 'Medicines can only be added while the prescription is pending.'}, status=status.HTTP_400_BAD_REQUEST)

        medicine_id = request.data.get('medicine_id')
        if not medicine_id:
            return Response({'success': False, 'message': 'medicine_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            quantity = int(request.data.get('quantity', 1))
        except (TypeError, ValueError):
            return Response({'success': False, 'message': 'quantity must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
        if quantity < 1:
            return Response({'success': False, 'message': 'Quantity must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            medicine = Medicine.objects.get(id=medicine_id)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)

        item = PrescriptionMedicineItem.objects.create(
            prescription=prescription, medicine=medicine, quantity=quantity, added_by=request.user,
        )
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

        Notification.objects.create(
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

        Notification.objects.create(
            user=req.pharmacy.user, type='PHARMACY_LOCATION_CHANGE_REVIEWED', title='Location Change Rejected',
            message=f'Your requested pharmacy location change was rejected: {admin_note}',
            link='/pharmacy/settings',
        )

        return Response({'success': True, 'data': {'request': PharmacyLocationChangeRequestSerializer(req).data}, 'message': 'Location change rejected.'})


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
        if file.size > DOCUMENT_MAX_SIZE:
            return Response({'success': False, 'message': 'File must be under 5MB.'}, status=status.HTTP_400_BAD_REQUEST)

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


# ─── Doctor Dashboard (Stage 2 of the doctor consult spec) ────────────────────
#
# Every view below is gated by IsDoctor (role-only) AND additionally scoped to request.user.doctor
# — same two-layer pattern as the pharmacy/delivery dashboards (get_managed_pharmacy() there,
# request.user.doctor here, since a doctor has no team-member concept to resolve).

def _doctor_not_found_response():
    return Response({'success': False, 'message': 'No doctor is associated with this account.'}, status=status.HTTP_403_FORBIDDEN)


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
        qs = doctor.appointments.select_related('user').order_by('-booked_at')
        status_filter = request.query_params.get('status', '').strip()
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({'success': True, 'data': {'appointments': DoctorAppointmentSerializer(qs, many=True).data}})


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

        Notification.objects.create(
            user=appt.user, type='APPOINTMENT_UPDATE', title='Meeting Link Ready',
            message=f'Dr. {doctor.name} has shared the meeting link for your appointment on {appt.scheduled_date}.',
            link=f'/doctor-consult/appointments/{appt.id}',
        )
        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt).data}, 'message': 'Meeting link set.'})


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

        appt.status = 'COMPLETED'
        appt.save(update_fields=['status'])

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

        return Response({'success': True, 'data': {'appointment': DoctorAppointmentSerializer(appt).data}, 'message': 'Appointment marked complete.'})


class DoctorPayoutListView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = getattr(request.user, 'doctor', None)
        if not doctor:
            return _doctor_not_found_response()
        payouts = doctor.payouts.select_related('appointment__user').order_by('-created_at')
        return Response({'success': True, 'data': {'payouts': DoctorPayoutSerializer(payouts, many=True).data}})


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
DOCUMENT_MAX_SIZE = 5 * 1024 * 1024


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
        if file.size > DOCUMENT_MAX_SIZE:
            return Response({'success': False, 'message': 'File must be under 5MB.'}, status=status.HTTP_400_BAD_REQUEST)

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
            },
        })
