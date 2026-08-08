from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, Address, Category, Brand, Medicine, Prescription, Cart, CartItem, Order, OrderItem, Review, WishlistItem, Notification, StockLog, SystemSetting, LabTestCategory, LabTest, LabTestBooking, BlogPost, MedicineSubscription, Doctor, DoctorAppointment, PlusPlan, PlusMembership, DoctorReview, HealthRecord, MedicineReminder, ReminderLog, Coupon, CouponUsage, Wallet, WalletTransaction, Referral, Permission, Pharmacy, DeliveryAgent


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    referral_code = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6)
    new_password = serializers.CharField(min_length=6, write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=6, write_only=True)


class UserProfileSerializer(serializers.ModelSerializer):
    permission_codes = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'full_name', 'email', 'phone', 'dob', 'gender',
            'blood_group', 'allergies', 'avatar_url', 'referral_code', 'role', 'is_active',
            'is_email_verified', 'notif_order_updates',
            'notif_prescription_alerts', 'notif_promotions',
            'is_super_admin', 'permission_codes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'email', 'referral_code', 'role', 'is_active', 'is_email_verified',
            'is_super_admin', 'permission_codes', 'created_at', 'updated_at',
        ]

    def get_permission_codes(self, obj):
        if obj.role != 'ADMIN':
            return []
        return list(obj.permissions.values_list('code', flat=True))

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.role != 'ADMIN':
            data.pop('is_super_admin', None)
            data.pop('permission_codes', None)
        return data


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'code', 'label', 'group', 'description']
        read_only_fields = fields


class AdminUserSerializer(serializers.ModelSerializer):
    permission_codes = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'is_active', 'is_super_admin', 'permission_codes', 'created_at']
        read_only_fields = fields

    def get_permission_codes(self, obj):
        return list(obj.permissions.values_list('code', flat=True))


class AdminUserCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    is_super_admin = serializers.BooleanField(default=False, required=False)
    permission_codes = serializers.ListField(child=serializers.CharField(), default=list, required=False)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value


class AdminPharmacySerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    user_is_active = serializers.BooleanField(source='user.is_active', read_only=True)

    class Meta:
        model = Pharmacy
        fields = ['id', 'name', 'email', 'license_number', 'phone', 'address', 'lat', 'lng', 'is_verified', 'is_active', 'user_is_active', 'created_at']
        read_only_fields = ['id', 'email', 'user_is_active', 'created_at']


class AdminPharmacyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    license_number = serializers.CharField(max_length=100)
    address = serializers.CharField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value

    def validate_license_number(self, value):
        if Pharmacy.objects.filter(license_number=value).exists():
            raise serializers.ValidationError('License number already registered.')
        return value


class AdminDeliveryAgentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    user_is_active = serializers.BooleanField(source='user.is_active', read_only=True)

    class Meta:
        model = DeliveryAgent
        fields = ['id', 'full_name', 'email', 'phone', 'vehicle_type', 'lat', 'lng', 'is_verified', 'is_online', 'user_is_active', 'created_at']
        read_only_fields = ['id', 'full_name', 'email', 'is_online', 'user_is_active', 'created_at']


class AdminDeliveryAgentCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    vehicle_type = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value


class AddressSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='name', required=False)
    address_line1 = serializers.CharField(source='address', required=False)
    state = serializers.CharField(source='province', required=False)
    zip_code = serializers.CharField(source='zip', required=False, allow_blank=True, default='')

    class Meta:
        model = Address
        fields = ['id', 'label', 'full_name', 'phone', 'address_line1', 'city', 'state', 'zip_code', 'lat', 'lng', 'is_default']
        read_only_fields = ['id']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'label' not in data or not data.get('label'):
            data['label'] = 'Home'
        return super().to_internal_value(data)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'icon', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'manufacturer', 'logo_url', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class MedicineListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)

    class Meta:
        model = Medicine
        fields = [
            'id', 'name', 'brand', 'brand_name', 'price', 'original_price', 'type',
            'in_stock', 'stock_quantity', 'image_url', 'rating',
            'total_reviews', 'category', 'category_name',
        ]


class MedicineDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True)
    brand = BrandSerializer(read_only=True)
    brand_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Medicine
        fields = [
            'id', 'name', 'description', 'dosage', 'usage',
            'side_effects', 'price', 'original_price', 'type', 'in_stock',
            'package_size', 'manufacturer', 'image_url', 'stock_quantity',
            'expiry_date', 'rating', 'total_reviews',
            'category', 'category_id', 'brand', 'brand_id',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'rating', 'total_reviews', 'created_at', 'updated_at']


class PrescriptionSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            'id', 'file_name', 'file_url', 'notes', 'doctor', 'hospital',
            'status', 'rejection_reason', 'expiry_date', 'uploaded_at', 'checkout_draft',
        ]
        read_only_fields = ['id', 'status', 'rejection_reason', 'uploaded_at', 'file_url']

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return obj.file_url or None


class CartItemSerializer(serializers.ModelSerializer):
    medicine = MedicineListSerializer(read_only=True)
    medicine_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'medicine', 'medicine_id', 'quantity']
        read_only_fields = ['id']


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)

    class Meta:
        model = Cart
        fields = ['id', 'items', 'created_at', 'updated_at']


class OrderItemSerializer(serializers.ModelSerializer):
    medicine = MedicineListSerializer(read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'medicine', 'quantity', 'unit_price', 'prescription']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shipping_address = AddressSerializer(source='address', read_only=True)
    user = serializers.SerializerMethodField()
    coupon_code = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'status', 'total_amount', 'delivery_charge', 'discount', 'coupon_code',
            'wallet_used', 'payment_method', 'payment_status', 'notes', 'order_rating', 'order_comment',
            'placed_at', 'updated_at', 'items', 'shipping_address', 'prescription',
        ]
        read_only_fields = ['id', 'placed_at', 'updated_at']

    def get_user(self, obj):
        return {
            'id': str(obj.user_id), 'full_name': obj.user.full_name,
            'email': obj.user.email, 'phone': obj.user.phone,
        }

    def get_coupon_code(self, obj):
        return obj.coupon.code if obj.coupon_id else None


class ReviewSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'user', 'rating', 'comment', 'created_at', 'is_mine']
        read_only_fields = ['id', 'user', 'created_at', 'is_mine']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name}

    def get_is_mine(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and user.id == obj.user_id)


class MyReviewSerializer(ReviewSerializer):
    medicine = serializers.SerializerMethodField()

    class Meta(ReviewSerializer.Meta):
        fields = ReviewSerializer.Meta.fields + ['medicine']

    def get_medicine(self, obj):
        return MedicineListSerializer(obj.medicine).data


class DoctorReviewSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = DoctorReview
        fields = ['id', 'user', 'rating', 'comment', 'created_at', 'is_mine']
        read_only_fields = ['id', 'user', 'created_at', 'is_mine']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name}

    def get_is_mine(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and user.id == obj.user_id)


class MyDoctorReviewSerializer(DoctorReviewSerializer):
    doctor = serializers.SerializerMethodField()

    class Meta(DoctorReviewSerializer.Meta):
        fields = DoctorReviewSerializer.Meta.fields + ['doctor']

    def get_doctor(self, obj):
        return DoctorSerializer(obj.doctor).data


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['key', 'value', 'updated_at']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'type', 'title', 'message', 'is_read', 'link', 'created_at']
        read_only_fields = ['id', 'created_at']


class StockLogSerializer(serializers.ModelSerializer):
    admin_name = serializers.CharField(source='admin.full_name', read_only=True, default='System')
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)

    class Meta:
        model = StockLog
        fields = [
            'id', 'medicine_name', 'admin_name', 'action',
            'quantity_before', 'quantity_change', 'quantity_after',
            'note', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class LabTestCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTestCategory
        fields = ['id', 'name', 'icon', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class LabTestListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = LabTest
        fields = [
            'id', 'name', 'category', 'category_name', 'sample_type', 'fasting_required',
            'reporting_time', 'is_package', 'price', 'original_price', 'total_bookings',
        ]


class LabTestDetailSerializer(serializers.ModelSerializer):
    category = LabTestCategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = LabTest
        fields = [
            'id', 'name', 'category', 'category_id', 'description', 'parameters_included',
            'sample_type', 'fasting_required', 'reporting_time', 'is_package',
            'price', 'original_price', 'is_active', 'total_bookings',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'total_bookings', 'created_at', 'updated_at']


class LabTestBookingSerializer(serializers.ModelSerializer):
    lab_test = LabTestListSerializer(read_only=True)
    lab_test_id = serializers.UUIDField(write_only=True)
    address = AddressSerializer(read_only=True)
    address_id = serializers.UUIDField(write_only=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = LabTestBooking
        fields = [
            'id', 'user', 'lab_test', 'lab_test_id', 'address', 'address_id',
            'scheduled_date', 'time_slot', 'status', 'total_amount', 'notes',
            'report_url', 'booked_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'total_amount', 'report_url', 'booked_at', 'updated_at']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name, 'email': obj.user.email, 'phone': obj.user.phone}


class PlusPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlusPlan
        fields = ['id', 'name', 'duration_days', 'price', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class PlusMembershipSerializer(serializers.ModelSerializer):
    plan = PlusPlanSerializer(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = PlusMembership
        fields = ['id', 'user', 'plan', 'started_at', 'expires_at', 'price_paid', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'plan', 'started_at', 'expires_at', 'price_paid', 'is_active', 'created_at', 'updated_at']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name, 'email': obj.user.email}


class HealthRecordSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = HealthRecord
        fields = ['id', 'title', 'record_type', 'file_url', 'notes', 'record_date', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at', 'file_url']

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class MedicineReminderSerializer(serializers.ModelSerializer):
    medicine_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = MedicineReminder
        fields = [
            'id', 'medicine_id', 'medicine_name', 'dosage', 'times', 'frequency',
            'start_date', 'end_date', 'notes', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ReminderLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderLog
        fields = ['id', 'reminder', 'scheduled_date', 'scheduled_time', 'taken_at']
        read_only_fields = ['id']


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = [
            'id', 'code', 'description', 'discount_type', 'discount_value', 'min_order_amount',
            'max_discount_amount', 'usage_limit', 'per_user_limit', 'valid_from', 'valid_until',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_code(self, value):
        return value.strip().upper()


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ['id', 'type', 'amount', 'reason', 'balance_after', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


class WalletSerializer(serializers.ModelSerializer):
    transactions = WalletTransactionSerializer(many=True, read_only=True)

    class Meta:
        model = Wallet
        fields = ['id', 'balance', 'updated_at', 'transactions']
        read_only_fields = ['id', 'balance', 'updated_at']


class ReferralSerializer(serializers.ModelSerializer):
    referred_user = serializers.SerializerMethodField()

    class Meta:
        model = Referral
        fields = ['id', 'referred_user', 'status', 'reward_amount', 'created_at', 'rewarded_at']
        read_only_fields = fields

    def get_referred_user(self, obj):
        return {'full_name': obj.referred_user.full_name, 'email': obj.referred_user.email}


class BlogPostListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ['id', 'title', 'slug', 'category', 'cover_image_url', 'excerpt', 'author', 'is_published', 'published_at']


class BlogPostDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = [
            'id', 'title', 'slug', 'category', 'cover_image_url', 'excerpt', 'content',
            'author', 'is_published', 'published_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'slug', 'published_at', 'created_at', 'updated_at']


class MedicineSubscriptionSerializer(serializers.ModelSerializer):
    medicine = MedicineListSerializer(read_only=True)
    medicine_id = serializers.UUIDField(write_only=True)
    address = AddressSerializer(read_only=True)
    address_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = MedicineSubscription
        fields = [
            'id', 'user', 'medicine', 'medicine_id', 'address', 'address_id',
            'quantity', 'frequency_days', 'is_active', 'next_delivery_date',
            'last_delivered_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'next_delivery_date', 'last_delivered_at', 'created_at', 'updated_at']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name, 'email': obj.user.email}


class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = [
            'id', 'name', 'specialty', 'qualification', 'experience_years', 'consultation_fee',
            'photo_url', 'bio', 'languages', 'is_active', 'rating', 'total_reviews',
            'total_consultations', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'rating', 'total_reviews', 'total_consultations', 'created_at', 'updated_at']


class DoctorAppointmentSerializer(serializers.ModelSerializer):
    doctor = DoctorSerializer(read_only=True)
    doctor_id = serializers.UUIDField(write_only=True)
    user = serializers.SerializerMethodField()

    class Meta:
        model = DoctorAppointment
        fields = [
            'id', 'user', 'doctor', 'doctor_id', 'scheduled_date', 'time_slot',
            'status', 'fee_amount', 'reason', 'meeting_link', 'booked_at', 'updated_at',
        ]
        read_only_fields = ['id', 'status', 'fee_amount', 'meeting_link', 'booked_at', 'updated_at']

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name, 'email': obj.user.email, 'phone': obj.user.phone}
