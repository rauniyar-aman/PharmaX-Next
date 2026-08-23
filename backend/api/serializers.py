from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.db.models import Sum
from django.utils import timezone
from .models import User, Address, Category, Brand, Medicine, Prescription, PrescriptionMedicineItem, PrescriptionLabTestItem, Cart, CartItem, Order, OrderItem, Review, WishlistItem, Notification, StockLog, SystemSetting, LabTestCategory, LabTest, LabTestBooking, BlogPost, MedicineSubscription, Doctor, DoctorAvailability, DoctorAppointment, DoctorPayout, PlusPlan, PlusMembership, DoctorReview, HealthRecord, MedicineReminder, ReminderLog, Coupon, CouponUsage, Wallet, WalletTransaction, Referral, Permission, Pharmacy, DeliveryAgent, PharmacyMedicineListing, FulfillmentRequest, OrderFulfillment, PharmacyPayout, DeliveryAgentEarning, DeliveryAgentCodLiability, PharmacyTeamMember, PharmacyBusinessHours, PharmacyDocument, PharmacyLocationChangeRequest


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
    delivery_agent_verified = serializers.SerializerMethodField()
    delivery_agent_online = serializers.SerializerMethodField()
    doctor_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'full_name', 'email', 'phone', 'dob', 'gender',
            'blood_group', 'allergies', 'avatar_url', 'referral_code', 'role', 'is_active',
            'is_email_verified', 'notif_order_updates',
            'notif_prescription_alerts', 'notif_promotions',
            'is_super_admin', 'permission_codes', 'delivery_agent_verified', 'delivery_agent_online',
            'doctor_verified',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'email', 'referral_code', 'role', 'is_active', 'is_email_verified',
            'is_super_admin', 'permission_codes', 'delivery_agent_verified', 'delivery_agent_online',
            'doctor_verified',
            'created_at', 'updated_at',
        ]

    def get_permission_codes(self, obj):
        if obj.role != 'ADMIN':
            return []
        return list(obj.permissions.values_list('code', flat=True))

    def get_delivery_agent_verified(self, obj):
        if obj.role != 'DELIVERY_AGENT':
            return None
        agent = getattr(obj, 'delivery_agent', None)
        return agent.is_verified if agent else False

    def get_delivery_agent_online(self, obj):
        if obj.role != 'DELIVERY_AGENT':
            return None
        agent = getattr(obj, 'delivery_agent', None)
        return agent.is_online if agent else False

    def get_doctor_verified(self, obj):
        if obj.role != 'DOCTOR':
            return None
        doctor = getattr(obj, 'doctor', None)
        return doctor.is_verified if doctor else False

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.role != 'ADMIN':
            data.pop('is_super_admin', None)
            data.pop('permission_codes', None)
        if instance.role != 'DELIVERY_AGENT':
            data.pop('delivery_agent_verified', None)
            data.pop('delivery_agent_online', None)
        if instance.role != 'DOCTOR':
            data.pop('doctor_verified', None)
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
        fields = [
            'id', 'name', 'email', 'license_number', 'phone', 'address', 'lat', 'lng',
            'logo_url', 'is_verified', 'is_active', 'user_is_active', 'created_at',
            'contact_person_name', 'contact_person_phone',
            'bank_name', 'bank_account_holder_name', 'bank_account_number', 'bank_branch',
        ]
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
    outstanding_cod_balance = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryAgent
        fields = [
            'id', 'full_name', 'email', 'phone', 'vehicle_type', 'lat', 'lng', 'is_verified', 'is_online',
            'user_is_active', 'outstanding_cod_balance', 'created_at',
        ]
        read_only_fields = ['id', 'full_name', 'email', 'is_online', 'user_is_active', 'outstanding_cod_balance', 'created_at']

    def get_outstanding_cod_balance(self, obj):
        # surfaced here (not just in the finance section) so an admin verifying/suspending an
        # agent can see at a glance whether they're currently holding platform cash.
        total = obj.cod_liabilities.filter(status='PENDING').aggregate(t=Sum('amount_collected'))['t']
        return str(total or Decimal('0'))


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


class AdminDoctorSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    user_is_active = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            'id', 'name', 'specialty', 'qualification', 'experience_years', 'consultation_fee',
            'photo_url', 'bio', 'languages', 'is_active', 'rating', 'total_reviews', 'total_consultations',
            'email', 'user_is_active', 'license_number', 'is_verified',
            'onboarding_fee_amount', 'onboarding_fee_paid', 'onboarding_fee_paid_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'rating', 'total_reviews', 'total_consultations', 'email', 'user_is_active', 'created_at', 'updated_at']

    def get_email(self, obj):
        # user is nullable — legacy doctors created before login accounts existed have none yet.
        return obj.user.email if obj.user_id else None

    def get_user_is_active(self, obj):
        return obj.user.is_active if obj.user_id else None


class AdminDoctorCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    specialty = serializers.CharField(max_length=100)
    qualification = serializers.CharField(max_length=255, required=False, allow_blank=True)
    experience_years = serializers.IntegerField(required=False, default=0)
    consultation_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    photo_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    bio = serializers.CharField(required=False, allow_blank=True)
    languages = serializers.CharField(max_length=255, required=False, allow_blank=True)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    license_number = serializers.CharField(max_length=100)
    onboarding_fee_amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal('0'))

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value

    def validate_license_number(self, value):
        if Doctor.objects.filter(license_number=value).exists():
            raise serializers.ValidationError('License number already registered.')
        return value


class AdminDoctorLinkAccountSerializer(serializers.Serializer):
    """For the legacy Doctor rows created before login accounts existed (Doctor.user is null) —
    creates the missing User and attaches it. Rejects outright if the doctor already has one;
    linking is a one-time action, not a way to reassign an existing login."""
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)

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
    medicine_item_count = serializers.SerializerMethodField()
    lab_test_item_count = serializers.SerializerMethodField()
    lab_test_pending_count = serializers.SerializerMethodField()
    all_files = serializers.SerializerMethodField()
    order = serializers.SerializerMethodField()
    appointment_id = serializers.UUIDField(read_only=True)
    appointment_date = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            'id', 'file_name', 'file_url', 'notes', 'doctor', 'hospital',
            'status', 'rejection_reason', 'admin_comment', 'expiry_date', 'uploaded_at', 'checkout_draft',
            'medicines_reviewed_at', 'medicine_item_count', 'lab_test_item_count', 'lab_test_pending_count',
            'all_files', 'order', 'source', 'appointment_id', 'appointment_date',
        ]
        read_only_fields = [
            'id', 'status', 'rejection_reason', 'admin_comment', 'uploaded_at', 'file_url',
            'medicines_reviewed_at', 'medicine_item_count', 'lab_test_item_count', 'lab_test_pending_count',
            'all_files', 'order', 'source', 'appointment_id', 'appointment_date',
        ]

    def get_lab_test_item_count(self, obj):
        return obj.lab_test_items.count()

    def get_lab_test_pending_count(self, obj):
        # Distinct from lab_test_item_count (the total ever suggested) — this is what should
        # actually drive whether a "still something to act on" CTA keeps showing.
        return obj.lab_test_items.filter(booking__isnull=True).count()

    def get_appointment_date(self, obj):
        return obj.appointment.scheduled_date if obj.appointment_id else None

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return obj.file_url or None

    def _abs_url(self, file_field):
        request = self.context.get('request')
        return request.build_absolute_uri(file_field.url) if request else file_field.url

    def get_all_files(self, obj):
        """Every page/file for this prescription — the primary file first, then any extras
        uploaded alongside it. Lets a multi-page prescription be reviewed/confirmed in full."""
        files = []
        if obj.file:
            files.append({'id': None, 'file_name': obj.file_name or obj.file.name, 'file_url': self._abs_url(obj.file)})
        for extra in obj.extra_files.all():
            files.append({'id': str(extra.id), 'file_name': extra.file_name or extra.file.name, 'file_url': self._abs_url(extra.file)})
        return files

    def get_medicine_item_count(self, obj):
        return obj.medicine_items.count()

    def get_order(self, obj):
        """The order this prescription was attached to at checkout, if any — prefers the precise
        per-medicine link (OrderItem.prescription) over the order-level fallback, since one order
        can carry several prescriptions when each Rx medicine got its own."""
        item = obj.order_items.select_related('order').order_by('-order__placed_at').first()
        order = item.order if item else obj.orders.order_by('-placed_at').first()
        if not order:
            return None
        return {'id': str(order.id), 'status': order.status, 'placed_at': order.placed_at}


class PrescriptionMedicineItemSerializer(serializers.ModelSerializer):
    medicine = MedicineListSerializer(read_only=True)

    class Meta:
        model = PrescriptionMedicineItem
        fields = ['id', 'medicine', 'quantity', 'created_at']
        read_only_fields = ['id', 'created_at']


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
    prescription = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ['id', 'medicine', 'quantity', 'unit_price', 'prescription']

    def get_prescription(self, obj):
        """Full per-item prescription context, not just the bare id — the customer needs to see
        exactly which medicine's prescription was rejected (and why), not just that "a"
        prescription somewhere on the order was rejected. The rejected prescription itself is
        never deleted (see PrescriptionDetailView — no delete endpoint exists), so this still
        surfaces it (file, reason) even though it's no longer eligible to be re-selected."""
        p = obj.prescription
        if not p:
            return None
        return {
            'id': str(p.id),
            'status': p.status,
            'file_name': p.file_name or (p.file.name if p.file else ''),
            'file_url': p.file.url if p.file else (p.file_url or None),
            'rejection_reason': p.rejection_reason if p.status == 'REJECTED' else None,
        }


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shipping_address = AddressSerializer(source='address', read_only=True)
    user = serializers.SerializerMethodField()
    coupon_code = serializers.SerializerMethodField()
    prescription_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'status', 'total_amount', 'delivery_charge', 'discount', 'coupon_code',
            'wallet_used', 'payment_method', 'payment_status', 'notes', 'order_rating', 'order_comment',
            'placed_at', 'updated_at', 'items', 'shipping_address', 'prescription', 'prescription_status',
        ]
        read_only_fields = ['id', 'placed_at', 'updated_at']

    def get_user(self, obj):
        return {
            'id': str(obj.user_id), 'full_name': obj.user.full_name,
            'email': obj.user.email, 'phone': obj.user.phone,
        }

    def get_coupon_code(self, obj):
        return obj.coupon.code if obj.coupon_id else None

    def get_prescription_status(self, obj):
        """Rolls up every Rx item's prescription into one status for the order: None if it has no
        Rx items, VERIFIED once every Rx item's prescription is admin-verified (so a pharmacy can
        actually start preparing it — see pharmacy_advance_fulfillment()'s gate), REJECTED if any
        is missing or rejected (customer needs to re-attach one), else PENDING — still awaiting
        review, though searching for a pharmacy proceeds regardless of this status."""
        rx_statuses = [i.prescription.status if i.prescription else None for i in obj.items.all() if i.medicine.type == 'Rx']
        if not rx_statuses:
            return None
        if any(s in (None, 'REJECTED') for s in rx_statuses):
            return 'REJECTED'
        if all(s == 'VERIFIED' for s in rx_statuses):
            return 'VERIFIED'
        return 'PENDING'


class AdminOrderFulfillmentSerializer(serializers.ModelSerializer):
    """Per-pharmacy-leg progress for admin's Order detail/list — this is the piece that answers
    'is it packed / ready for pickup / with the rider yet', which Order.status alone can't (it
    just sits at PLACED for the whole marketplace journey until every leg is DELIVERED)."""
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    delivery_agent_name = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    prescription_ready = serializers.SerializerMethodField()

    class Meta:
        model = OrderFulfillment
        fields = [
            'id', 'pharmacy_name', 'status', 'items', 'delivery_agent_name',
            'accepted_at', 'delivery_broadcast_at', 'delivered_at',
            'rider_rating', 'rider_rating_comment', 'prescription_ready',
        ]
        read_only_fields = fields

    def get_delivery_agent_name(self, obj):
        return obj.delivery_agent.user.full_name if obj.delivery_agent else None

    def get_items(self, obj):
        return [
            {'medicine_name': i.medicine.name, 'quantity': i.quantity}
            for i in obj.order_items.select_related('medicine').all()
        ]

    def get_prescription_ready(self, obj):
        """False if this leg includes an Rx item whose prescription isn't yet VERIFIED — admin's
        status label needs this because a fulfillment sits at ACCEPTED (labeled "Preparing")
        whether it's actively being prepped or just blocked by pharmacy_advance_fulfillment()'s
        gate; without this the two look identical."""
        return not any(
            item.medicine.type == 'Rx' and (not item.prescription or item.prescription.status != 'VERIFIED')
            for item in obj.order_items.select_related('medicine', 'prescription').all()
        )


class AdminFulfillmentRequestSerializer(serializers.ModelSerializer):
    """Every pharmacy an order's items were actually offered to, and how each one responded —
    ACCEPTED / DECLINED (said no) / EXPIRED (never responded in time) / PENDING (still waiting).
    This is the pharmacy-performance data Order-level status can't show: an order can show
    NO_PHARMACY_FOUND with zero fulfillments while still having a full trail of who was asked and
    who ignored or declined it."""
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    medicine_name = serializers.CharField(source='order_item.medicine.name', read_only=True)
    quantity = serializers.IntegerField(source='order_item.quantity', read_only=True)

    class Meta:
        model = FulfillmentRequest
        fields = ['id', 'pharmacy_name', 'medicine_name', 'quantity', 'status', 'created_at', 'responded_at']
        read_only_fields = fields


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


class PrescriptionLabTestItemSerializer(serializers.ModelSerializer):
    lab_test = LabTestListSerializer(read_only=True)
    booking_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PrescriptionLabTestItem
        fields = ['id', 'lab_test', 'booking_id', 'created_at']
        read_only_fields = ['id', 'created_at']


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


class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorAvailability
        fields = ['id', 'day_of_week', 'start_time', 'end_time', 'slot_duration_minutes', 'is_active']
        read_only_fields = ['id']


class DoctorAppointmentSerializer(serializers.ModelSerializer):
    doctor = DoctorSerializer(read_only=True)
    doctor_id = serializers.UUIDField(write_only=True)
    user = serializers.SerializerMethodField()
    prescription = serializers.SerializerMethodField()

    class Meta:
        model = DoctorAppointment
        fields = [
            'id', 'user', 'doctor', 'doctor_id', 'scheduled_date', 'time_slot',
            'status', 'fee_amount', 'reason', 'meeting_link',
            'fee_charged', 'is_plus_free', 'payment_status', 'payment_method',
            'prescription', 'booked_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'fee_amount', 'meeting_link',
            'fee_charged', 'is_plus_free', 'payment_status', 'payment_method',
            'prescription', 'booked_at', 'updated_at',
        ]

    def get_user(self, obj):
        return {'id': str(obj.user_id), 'full_name': obj.user.full_name, 'email': obj.user.email, 'phone': obj.user.phone}

    def get_prescription(self, obj):
        # Lets the patient's appointment view surface consultation notes directly — including for
        # a notes-only consultation, which has no other visible entry point (no cart/booking CTA).
        presc = getattr(obj, 'prescription', None)
        if not presc:
            return None
        return {
            'id': str(presc.id),
            'notes': presc.notes,
            'medicine_item_count': presc.medicine_items.count(),
            'lab_test_item_count': presc.lab_test_items.count(),
        }


# ─── Pharmacy dashboard (Stage 5) ──────────────────────────────────────────────

class PharmacyProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pharmacy
        fields = [
            'id', 'name', 'license_number', 'phone', 'address', 'lat', 'lng',
            'logo_url', 'is_verified', 'is_active', 'created_at',
            'contact_person_name', 'contact_person_phone',
            'bank_name', 'bank_account_holder_name', 'bank_account_number', 'bank_branch',
        ]
        # license_number is a legal/compliance identifier — changing it goes through admin
        # (AdminPharmacyDetailView), not self-service. is_verified is admin-only for the same
        # reason. logo_url is set only via PharmacyLogoUploadView, never a raw PATCH.
        read_only_fields = ['id', 'license_number', 'logo_url', 'is_verified', 'created_at']


class PharmacyDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source='get_doc_type_display', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)

    class Meta:
        model = PharmacyDocument
        fields = ['id', 'doc_type', 'doc_type_label', 'file_url', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = fields


class PharmacyLocationChangeRequestSerializer(serializers.ModelSerializer):
    reviewed_by_name = serializers.CharField(source='reviewed_by.full_name', read_only=True)

    class Meta:
        model = PharmacyLocationChangeRequest
        fields = [
            'id', 'requested_lat', 'requested_lng', 'requested_address', 'reason', 'status',
            'admin_note', 'reviewed_by_name', 'reviewed_at', 'created_at',
        ]
        read_only_fields = fields


class PharmacyBusinessHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = PharmacyBusinessHours
        fields = ['weekday', 'weekday_label', 'is_closed', 'open_time', 'close_time']


class PharmacyListingSerializer(serializers.ModelSerializer):
    medicine_id = serializers.UUIDField(source='medicine.id', read_only=True)
    medicine_name = serializers.CharField(source='medicine.name', read_only=True)
    medicine_image_url = serializers.CharField(source='medicine.image_url', read_only=True)
    medicine_price = serializers.DecimalField(source='medicine.price', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = PharmacyMedicineListing
        fields = [
            'id', 'medicine_id', 'medicine_name', 'medicine_image_url', 'medicine_price',
            'stock_quantity', 'expiry_date', 'is_available', 'updated_at',
        ]
        read_only_fields = ['id', 'medicine_id', 'medicine_name', 'medicine_image_url', 'medicine_price', 'updated_at']


class PharmacyListingCreateSerializer(serializers.Serializer):
    medicine_id = serializers.UUIDField()
    stock_quantity = serializers.IntegerField(min_value=0)
    expiry_date = serializers.DateField()
    is_available = serializers.BooleanField(default=True, required=False)


class PharmacyFulfillmentRequestSerializer(serializers.ModelSerializer):
    """Deliberately excludes the customer's exact address, name, and phone — a pharmacy only
    needs city/area-level context to decide whether to accept, until it actually wins the item."""
    order_id = serializers.UUIDField(source='order_item.order_id', read_only=True)
    medicine_id = serializers.UUIDField(source='order_item.medicine_id', read_only=True)
    medicine_name = serializers.CharField(source='order_item.medicine.name', read_only=True)
    medicine_image_url = serializers.CharField(source='order_item.medicine.image_url', read_only=True)
    quantity = serializers.IntegerField(source='order_item.quantity', read_only=True)
    city = serializers.SerializerMethodField()
    province = serializers.SerializerMethodField()

    class Meta:
        model = FulfillmentRequest
        fields = [
            'id', 'order_id', 'medicine_id', 'medicine_name', 'medicine_image_url',
            'quantity', 'city', 'province', 'status', 'created_at',
        ]

    def get_city(self, obj):
        addr = obj.order_item.order.address
        return addr.city if addr else None

    def get_province(self, obj):
        addr = obj.order_item.order.address
        return addr.province if addr else None


class PharmacyOrderFulfillmentSerializer(serializers.ModelSerializer):
    order_placed_at = serializers.DateTimeField(source='order.placed_at', read_only=True)
    # The order's own marketplace-lifecycle status (BROADCASTING/AWAITING_PAYMENT/PLACED/...) —
    # distinct from `payment_status` below (PAID/PENDING). The pharmacy dashboard needs this to
    # know whether "Ready for Pickup" is actually allowed yet (order.status == 'PLACED', i.e.
    # payment confirmed) versus still waiting on the customer.
    order_status = serializers.CharField(source='order.status', read_only=True)
    items = serializers.SerializerMethodField()
    delivery_agent_name = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()
    destination_lat = serializers.SerializerMethodField()
    destination_lng = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payout_amount = serializers.SerializerMethodField()
    payout_paid_at = serializers.SerializerMethodField()
    payout_gross_amount = serializers.SerializerMethodField()
    payout_commission_amount = serializers.SerializerMethodField()
    prescription_ready = serializers.SerializerMethodField()

    class Meta:
        model = OrderFulfillment
        fields = [
            'id', 'order_id', 'order_placed_at', 'order_status', 'status', 'items',
            'delivery_agent_name', 'city', 'destination_lat', 'destination_lng',
            'accepted_at', 'delivered_at',
            'payment_status', 'payout_amount', 'payout_paid_at',
            'payout_gross_amount', 'payout_commission_amount', 'prescription_ready',
            # Deliberately exposes whether pickup was verified but NEVER pickup_code itself — the
            # pharmacy has to actually collect the code from the rider in person, not read it off
            # their own dashboard.
            'pickup_verified_at',
        ]

    def get_prescription_ready(self, obj):
        """False if any Rx item in THIS pharmacy's slice still needs a verified prescription —
        mirrors pharmacy_advance_fulfillment()'s gate, so the dashboard can explain why "advance"
        is blocked before the pharmacy even tries."""
        return not any(
            item.medicine.type == 'Rx' and (not item.prescription or item.prescription.status != 'VERIFIED')
            for item in obj.order_items.all()
        )

    def get_payment_status(self, obj):
        # context['show_finance'] is set by the view from _can_view_finance() — False for a team
        # member the owner hasn't granted finance visibility to, always True for the owner.
        if not self.context.get('show_finance', True):
            return 'HIDDEN'
        # PharmacyPayout is only created once the fulfillment is DELIVERED (see
        # _create_settlement_records) — before that there's nothing to be paid yet.
        payout = getattr(obj, 'pharmacy_payout', None)
        if not payout:
            return 'NOT_APPLICABLE'
        return payout.status  # 'PENDING' or 'PAID'

    def get_payout_amount(self, obj):
        if not self.context.get('show_finance', True):
            return None
        payout = getattr(obj, 'pharmacy_payout', None)
        return str(payout.net_payable) if payout else None

    def get_payout_paid_at(self, obj):
        if not self.context.get('show_finance', True):
            return None
        payout = getattr(obj, 'pharmacy_payout', None)
        return payout.paid_at if payout else None

    def get_payout_gross_amount(self, obj):
        # what the pharmacy actually earned on this order, before the platform's commission cut
        if not self.context.get('show_finance', True):
            return None
        payout = getattr(obj, 'pharmacy_payout', None)
        return str(payout.gross_amount) if payout else None

    def get_payout_commission_amount(self, obj):
        if not self.context.get('show_finance', True):
            return None
        payout = getattr(obj, 'pharmacy_payout', None)
        return str(payout.commission_amount) if payout else None

    def get_items(self, obj):
        # Plain .all() (no .select_related() chained on) so this reads from the
        # prefetch_related('order_items__medicine') cache the view sets up — chaining
        # .select_related() here builds a distinct queryset that bypasses that cache and fires
        # one extra query per fulfillment instead of zero.
        return [
            {
                'medicine_id': str(i.medicine_id), 'medicine_name': i.medicine.name,
                'quantity': i.quantity, 'unit_price': str(i.unit_price),
            }
            for i in obj.order_items.all()
        ]

    def get_delivery_agent_name(self, obj):
        return obj.delivery_agent.user.full_name if obj.delivery_agent else None

    def get_city(self, obj):
        addr = obj.order.address
        return addr.city if addr else None

    def get_destination_lat(self, obj):
        addr = obj.order.address
        return addr.lat if addr else None

    def get_destination_lng(self, obj):
        addr = obj.order.address
        return addr.lng if addr else None


class PharmacyTeamMemberSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)

    class Meta:
        model = PharmacyTeamMember
        fields = ['id', 'full_name', 'email', 'phone', 'is_active', 'can_view_finance', 'created_at']
        read_only_fields = fields


class PharmacyTeamMemberCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=6, write_only=True)
    can_view_finance = serializers.BooleanField(default=False, required=False)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Email already registered.')
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError('Phone number already registered.')
        return value


# ─── Delivery dashboard (Stage 6) ──────────────────────────────────────────────

class DeliveryFulfillmentSerializer(serializers.ModelSerializer):
    """Available-to-accept deliveries. Shows the full pickup (pharmacy) location — that's not
    sensitive, it's where the rider needs to go to even accept the job — but deliberately excludes
    the customer entirely, same "don't reveal until you've won it" principle as Stage 5's
    PharmacyFulfillmentRequestSerializer."""
    order_id = serializers.UUIDField(read_only=True)
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    pharmacy_address = serializers.CharField(source='pharmacy.address', read_only=True)
    pharmacy_lat = serializers.FloatField(source='pharmacy.lat', read_only=True)
    pharmacy_lng = serializers.FloatField(source='pharmacy.lng', read_only=True)
    city = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = OrderFulfillment
        fields = [
            'id', 'order_id', 'status', 'pharmacy_name', 'pharmacy_address', 'pharmacy_lat', 'pharmacy_lng',
            'city', 'items', 'delivery_broadcast_at',
        ]

    def get_city(self, obj):
        addr = obj.order.address
        return addr.city if addr else None

    def get_items(self, obj):
        return [{'medicine_name': i.medicine.name, 'quantity': i.quantity} for i in obj.order_items.select_related('medicine').all()]


class DeliveryActiveSerializer(serializers.ModelSerializer):
    """A delivery this agent has already won — now it's appropriate to show the full drop-off
    (customer) address/phone, since the agent has to actually get there."""
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    pharmacy_address = serializers.CharField(source='pharmacy.address', read_only=True)
    pharmacy_lat = serializers.FloatField(source='pharmacy.lat', read_only=True)
    pharmacy_lng = serializers.FloatField(source='pharmacy.lng', read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    delivery_address = serializers.SerializerMethodField()
    delivery_lat = serializers.SerializerMethodField()
    delivery_lng = serializers.SerializerMethodField()
    payment_method = serializers.CharField(source='order.payment_method', read_only=True)
    items = serializers.SerializerMethodField()

    class Meta:
        model = OrderFulfillment
        fields = [
            'id', 'order_id', 'status', 'pharmacy_name', 'pharmacy_address', 'pharmacy_lat', 'pharmacy_lng',
            'customer_name', 'customer_phone', 'delivery_address', 'delivery_lat', 'delivery_lng',
            'payment_method', 'items', 'accepted_at', 'pickup_code', 'pickup_verified_at',
        ]

    def get_customer_name(self, obj):
        addr = obj.order.address
        return addr.name if addr else None

    def get_customer_phone(self, obj):
        addr = obj.order.address
        return addr.phone if addr else None

    def get_delivery_address(self, obj):
        addr = obj.order.address
        return f'{addr.address}, {addr.city}, {addr.province}' if addr else None

    def get_delivery_lat(self, obj):
        addr = obj.order.address
        return addr.lat if addr else None

    def get_delivery_lng(self, obj):
        addr = obj.order.address
        return addr.lng if addr else None

    def get_items(self, obj):
        return [{'medicine_name': i.medicine.name, 'quantity': i.quantity} for i in obj.order_items.select_related('medicine').all()]


# ─── Admin: Finance / Settlement Ledgers (Stage 8) ─────────────────────────────

class AdminPharmacyPayoutSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    order_id = serializers.UUIDField(source='fulfillment.order_id', read_only=True)
    paid_by_name = serializers.CharField(source='paid_by.full_name', read_only=True)

    class Meta:
        model = PharmacyPayout
        fields = [
            'id', 'pharmacy', 'pharmacy_name', 'fulfillment', 'order_id',
            'gross_amount', 'commission_rate', 'commission_amount', 'net_payable',
            'funding_source', 'status', 'paid_at', 'paid_by_name', 'created_at',
        ]
        read_only_fields = fields


class DoctorPayoutSerializer(serializers.ModelSerializer):
    """Doctor's own earnings ledger — same fields as AdminDoctorPayoutSerializer minus the
    doctor-identifying ones, since a doctor only ever sees their own rows."""
    patient_name = serializers.CharField(source='appointment.user.full_name', read_only=True)
    appointment_date = serializers.DateField(source='appointment.scheduled_date', read_only=True)

    class Meta:
        model = DoctorPayout
        fields = [
            'id', 'appointment', 'patient_name', 'appointment_date',
            'gross_amount', 'commission_rate', 'commission_amount', 'net_payable',
            'status', 'paid_at', 'created_at',
        ]
        read_only_fields = fields


class AdminDoctorPayoutSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    appointment_date = serializers.DateField(source='appointment.scheduled_date', read_only=True)
    paid_by_name = serializers.CharField(source='paid_by.full_name', read_only=True)

    class Meta:
        model = DoctorPayout
        fields = [
            'id', 'doctor', 'doctor_name', 'appointment', 'appointment_date',
            'gross_amount', 'commission_rate', 'commission_amount', 'net_payable',
            'status', 'paid_at', 'paid_by_name', 'created_at',
        ]
        read_only_fields = fields


class AdminDeliveryAgentEarningSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.user.full_name', read_only=True)
    order_id = serializers.UUIDField(source='fulfillment.order_id', read_only=True)
    paid_by_name = serializers.CharField(source='paid_by.full_name', read_only=True)

    class Meta:
        model = DeliveryAgentEarning
        fields = ['id', 'agent', 'agent_name', 'fulfillment', 'order_id', 'amount', 'status', 'paid_at', 'paid_by_name', 'created_at']
        read_only_fields = fields


class AdminDeliveryAgentCodLiabilitySerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.user.full_name', read_only=True)
    order_id = serializers.UUIDField(source='fulfillment.order_id', read_only=True)
    confirmed_by_name = serializers.CharField(source='confirmed_by.full_name', read_only=True)
    days_outstanding = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryAgentCodLiability
        fields = [
            'id', 'agent', 'agent_name', 'fulfillment', 'order_id', 'amount_collected', 'status',
            'remittance_method', 'reference', 'remitted_at', 'confirmed_by_name', 'days_outstanding', 'created_at',
        ]
        read_only_fields = fields

    def get_days_outstanding(self, obj):
        if obj.status != 'PENDING':
            return None
        return (timezone.now() - obj.created_at).days
