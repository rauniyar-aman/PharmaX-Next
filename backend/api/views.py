import hmac
import hashlib
import base64
import json
import os
import uuid as uuid_lib
import requests
from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.db.models import Q, Avg, Count, Sum
from django.db import transaction
from django.http import HttpResponseRedirect
from django.conf import settings
from decimal import Decimal

from .models import (
    User, Address, Category, Medicine, Prescription,
    Cart, CartItem, Order, OrderItem, Review, WishlistItem,
    Notification, SystemSetting, StockLog,
)
from .serializers import (
    RegisterSerializer, OTPVerifySerializer, ResendOTPSerializer,
    LoginSerializer, ForgotPasswordSerializer, ResetPasswordSerializer,
    ChangePasswordSerializer, UserProfileSerializer,
    CategorySerializer, MedicineListSerializer, MedicineDetailSerializer,
    AddressSerializer, PrescriptionSerializer, CartSerializer,
    CartItemSerializer, OrderSerializer, ReviewSerializer, MyReviewSerializer,
    NotificationSerializer, StockLogSerializer, SystemSettingSerializer,
)
from .utils import generate_otp, send_otp_email_async, get_store_name
from .permissions import IsAdmin
from .throttles import AuthRateThrottle

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
        qs = Medicine.objects.select_related('category').all()

        search = request.query_params.get('search', '').strip()
        category = request.query_params.get('category', '').strip()
        type_ = request.query_params.get('type', '').strip()
        in_stock = request.query_params.get('inStock', '').strip()
        min_price = request.query_params.get('minPrice')
        max_price = request.query_params.get('maxPrice')
        sort = request.query_params.get('sortBy', 'popular')

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__icontains=search) | Q(manufacturer__icontains=search))
        if category:
            try:
                uuid_lib.UUID(category)
                qs = qs.filter(Q(category__name__iexact=category) | Q(category__id=category))
            except ValueError:
                qs = qs.filter(category__name__iexact=category)
        if type_ in ('Rx', 'OTC'):
            qs = qs.filter(type=type_)
        if in_stock == 'true':
            qs = qs.filter(in_stock=True)
        elif in_stock == 'false':
            qs = qs.filter(in_stock=False)
        if min_price:
            qs = qs.filter(price__gte=Decimal(min_price))
        if max_price:
            qs = qs.filter(price__lte=Decimal(max_price))

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
            limit = min(50, max(1, int(request.query_params.get('limit', 12))))
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


class MedicineDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            medicine = Medicine.objects.select_related('category').get(id=pk)
        except Medicine.DoesNotExist:
            return Response({'success': False, 'message': 'Medicine not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'medicine': MedicineDetailSerializer(medicine).data}})


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

        cart, _ = Cart.objects.get_or_create(user=request.user)
        item, created = CartItem.objects.get_or_create(cart=cart, medicine=medicine, defaults={'quantity': quantity})
        if not created:
            item.quantity += quantity
            item.save(update_fields=['quantity'])

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
        items = WishlistItem.objects.filter(user=request.user).select_related('medicine__category').order_by('-added_at')
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
    """Hides checkout-draft prescriptions until the order they're attached to actually goes through."""
    active_order = (
        Q(orders__payment_method='CASH_ON_DELIVERY') & ~Q(orders__status='CANCELLED')
    ) | (
        Q(orders__payment_method__in=['ESEWA', 'KHALTI']) & Q(orders__payment_status='PAID')
    )
    return Q(checkout_draft=False) | active_order


class PrescriptionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prescriptions = Prescription.objects.filter(user=request.user).filter(
            _prescription_visibility_filter()
        ).distinct().order_by('-uploaded_at')
        return Response({'success': True, 'data': {'prescriptions': PrescriptionSerializer(prescriptions, many=True).data}})

    def post(self, request):
        files = request.FILES.getlist('files') or ([request.FILES['file']] if request.FILES.get('file') else [])
        if not files:
            return Response({'success': False, 'message': 'At least one file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > 10:
            return Response({'success': False, 'message': 'You can upload up to 10 files at once.'}, status=status.HTTP_400_BAD_REQUEST)

        checkout_draft = str(request.data.get('checkout_draft', '')).lower() == 'true'
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

    def delete(self, request, pk):
        try:
            p = Prescription.objects.get(id=pk, user=request.user)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        if p.file:
            p.file.delete(save=False)
        p.delete()
        return Response({'success': True, 'message': 'Prescription deleted.'})


# ─── Orders ───────────────────────────────────────────────────────────────────

def _get_setting(key, default):
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def _create_order_from_cart(user, address_id, prescription_id, payment_method, notes='',
                             payment_status='PENDING', order_status='PLACED', clear_cart=True):
    """Returns (order, error_response). Exactly one is None."""
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
        delivery = Decimal('0') if total >= free_threshold else delivery_charge_setting

        order = Order.objects.create(
            user=user,
            address=address,
            prescription=prescription,
            total_amount=total + delivery,
            delivery_charge=delivery,
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

        if clear_cart:
            cart.items.all().delete()

    Notification.objects.create(
        user=user,
        type='ORDER',
        title='Order Placed',
        message=f'Your order #{str(order.id)[:8]} has been placed successfully.',
        link=f'/orders/{order.id}',
    )
    return order, None


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user).select_related('user').prefetch_related('items__medicine').order_by('-placed_at')
        return Response({'success': True, 'data': {'orders': OrderSerializer(orders, many=True).data}})

    def post(self, request):
        address_id = request.data.get('shipping_address_id') or request.data.get('addressId')
        payment_method = request.data.get('payment_method') or request.data.get('paymentMethod', 'CASH_ON_DELIVERY')
        prescription_id = request.data.get('prescription_id') or request.data.get('prescriptionId')
        notes = request.data.get('notes', '')

        order, err = _create_order_from_cart(request.user, address_id, prescription_id, payment_method, notes)
        if err:
            return err
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}}, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            order = Order.objects.prefetch_related('items__medicine').select_related('user', 'address', 'prescription').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}})


class OrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            order = Order.objects.prefetch_related('items__medicine').get(id=pk, user=request.user)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        if order.status not in ('PLACED', 'CONFIRMED'):
            return Response({'success': False, 'message': 'Order cannot be cancelled at this stage.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for item in order.items.all():
                med = item.medicine
                med.stock_quantity += item.quantity
                med.in_stock = True
                med.save(update_fields=['stock_quantity', 'in_stock'])
            order.status = 'CANCELLED'
            if order.payment_status == 'PENDING':
                order.payment_status = 'FAILED'
            order.save(update_fields=['status', 'payment_status'])

        Notification.objects.create(
            user=request.user, type='ORDER_UPDATE', title='Order Cancelled',
            message=f'Your order #{str(order.id)[:8]} has been cancelled.',
            link=f'/orders/{order.id}',
        )
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}, 'message': 'Order cancelled.'})


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


# ─── Payment ──────────────────────────────────────────────────────────────────

def _esewa_signature(total_amount, transaction_uuid):
    msg = f'total_amount={total_amount},transaction_uuid={transaction_uuid},product_code={ESEWA_PRODUCT_CODE}'
    return base64.b64encode(hmac.new(ESEWA_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).digest()).decode()


class PaymentCodPlaceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        address_id = request.data.get('address_id')
        if not address_id:
            return Response({'success': False, 'message': 'Delivery address is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _create_order_from_cart(
            request.user, address_id, request.data.get('prescription_id'),
            payment_method='CASH_ON_DELIVERY', notes=request.data.get('notes', ''),
            payment_status='PENDING', order_status='PLACED',
        )
        if err:
            return err
        return Response({'success': True, 'data': {'order': OrderSerializer(order).data}}, status=status.HTTP_201_CREATED)


class PaymentEsewaInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        address_id = request.data.get('address_id')
        if not address_id:
            return Response({'success': False, 'message': 'Delivery address is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _create_order_from_cart(
            request.user, address_id, request.data.get('prescription_id'),
            payment_method='ESEWA', notes=request.data.get('notes', ''),
            payment_status='PENDING', order_status='PLACED', clear_cart=False,
        )
        if err:
            return err

        transaction_uuid = f'{order.id}-{int(timezone.now().timestamp())}'
        order.esewa_transaction_uuid = transaction_uuid
        order.save(update_fields=['esewa_transaction_uuid'])

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
    order.payment_status = 'PAID'
    order.status = 'CONFIRMED'
    order.save(update_fields=['payment_status', 'status'])
    cart = Cart.objects.filter(user=order.user).first()
    if cart:
        cart.items.all().delete()
    Notification.objects.create(
        user=order.user, type='PAYMENT_UPDATE', title='Payment Received',
        message=f'Payment for order #{str(order.id)[:8]} was received successfully.',
        link=f'/orders/{order.id}',
    )


def _cancel_unpaid_order(order):
    if order.payment_status == 'PENDING':
        order.payment_status = 'FAILED'
        order.status = 'CANCELLED'
        order.save(update_fields=['payment_status', 'status'])


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
        'Authorization': f'Key {KHALTI_SECRET_KEY}',
        'Content-Type': 'application/json',
    }, timeout=15)
    return resp.json()


class PaymentKhaltiInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        address_id = request.data.get('address_id')
        if not address_id:
            return Response({'success': False, 'message': 'Delivery address is required.'}, status=status.HTTP_400_BAD_REQUEST)
        order, err = _create_order_from_cart(
            request.user, address_id, request.data.get('prescription_id'),
            payment_method='KHALTI', notes=request.data.get('notes', ''),
            payment_status='PENDING', order_status='PLACED', clear_cart=False,
        )
        if err:
            return err

        amount_paisa = int(round(float(order.total_amount) * 100))
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
            order.delete()
            return Response({'success': False, 'message': 'Failed to reach Khalti.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not khalti_res.get('pidx'):
            order.delete()
            return Response({'success': False, 'message': khalti_res.get('detail') or khalti_res.get('message') or 'Khalti initiation failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        order.khalti_pidx = khalti_res['pidx']
        order.save(update_fields=['khalti_pidx'])
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
    permission_classes = [IsAuthenticated, IsAdmin]

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
        recent_orders = Order.objects.select_related('user').order_by('-placed_at')[:6]
        recent = OrderSerializer(recent_orders, many=True).data

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
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        start_of_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        total_revenue = Order.objects.filter(payment_status='PAID').aggregate(s=Sum('total_amount'))['s'] or 0
        monthly_revenue = Order.objects.filter(payment_status='PAID', placed_at__gte=start_of_month).aggregate(s=Sum('total_amount'))['s'] or 0
        total_orders = Order.objects.exclude(status='CANCELLED').count()
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
            OrderItem.objects.exclude(order__status='CANCELLED')
            .values('medicine_id', 'medicine__name', 'medicine__brand', 'medicine__price')
            .annotate(total_qty=Sum('quantity'))
            .order_by('-total_qty')[:8]
        )
        top_medicines = [
            {
                'medicine': {'id': str(t['medicine_id']), 'name': t['medicine__name'], 'brand': t['medicine__brand']},
                'total_qty': t['total_qty'],
                'revenue': float(t['total_qty'] * t['medicine__price']),
            }
            for t in top_items
        ]

        six_months_ago = (start_of_month - timedelta(days=150)).replace(day=1)
        recent_orders = Order.objects.exclude(status='CANCELLED').filter(placed_at__gte=six_months_ago).values('placed_at', 'total_amount', 'payment_status')
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
    permission_classes = [IsAuthenticated, IsAdmin]

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
    permission_classes = [IsAuthenticated, IsAdmin]

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


class AdminMedicineListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Medicine.objects.select_related('category').order_by('-created_at')
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__icontains=search))
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
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            medicine = Medicine.objects.select_related('category').get(id=pk)
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


class AdminOrderListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Order.objects.select_related('user').prefetch_related('items').order_by('-placed_at')
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
        return Response({
            'success': True,
            'data': {
                'orders': OrderSerializer(orders, many=True).data,
                'pagination': {'total': total, 'page': page, 'limit': limit, 'totalPages': (total + limit - 1) // limit},
            },
        })


class AdminOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            order = Order.objects.select_related('user', 'address', 'prescription').prefetch_related('items__medicine').get(id=pk)
        except Order.DoesNotExist:
            return Response({'success': False, 'message': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        data = OrderSerializer(order).data
        data['customer'] = UserProfileSerializer(order.user).data
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


class AdminPrescriptionListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Prescription.objects.select_related('user').filter(_prescription_visibility_filter()).distinct().order_by('-uploaded_at')
        status_filter = request.query_params.get('status', 'PENDING')
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


class AdminPrescriptionDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def put(self, request, pk):
        try:
            prescription = Prescription.objects.select_related('user').get(id=pk)
        except Prescription.DoesNotExist:
            return Response({'success': False, 'message': 'Prescription not found.'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        rejection_reason = request.data.get('rejection_reason', '')
        if new_status not in ('VERIFIED', 'REJECTED'):
            return Response({'success': False, 'message': 'Status must be VERIFIED or REJECTED.'}, status=status.HTTP_400_BAD_REQUEST)
        prescription.status = new_status
        prescription.rejection_reason = rejection_reason if new_status == 'REJECTED' else ''
        prescription.save(update_fields=['status', 'rejection_reason'])
        Notification.objects.create(
            user=prescription.user,
            type='PRESCRIPTION',
            title='Prescription ' + new_status.capitalize(),
            message=f'Your prescription has been {new_status.lower()}.' + (f' Reason: {rejection_reason}' if rejection_reason else ''),
        )
        return Response({'success': True, 'data': {'prescription': PrescriptionSerializer(prescription).data}})


class AdminCustomerListView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

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
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            customer = User.objects.get(id=pk, role='CUSTOMER')
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        orders = Order.objects.filter(user=customer).order_by('-placed_at')[:10]
        return Response({
            'success': True,
            'data': {
                'customer': UserProfileSerializer(customer).data,
                'orders': OrderSerializer(orders, many=True).data,
            },
        })


class AdminCustomerBlockView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

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
    permission_classes = [IsAuthenticated, IsAdmin]

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
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        qs = Medicine.objects.select_related('category').order_by('stock_quantity')
        filter_type = request.query_params.get('filter', 'all')
        if filter_type == 'low':
            low_stock_threshold = int(_get_setting('low_stock_threshold', '10'))
            qs = qs.filter(stock_quantity__lte=low_stock_threshold, in_stock=True)
        elif filter_type == 'out':
            qs = qs.filter(in_stock=False)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(brand__icontains=search))
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
    permission_classes = [IsAuthenticated, IsAdmin]

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
