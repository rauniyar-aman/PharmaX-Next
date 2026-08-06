from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import User, Address, Category, Medicine, Prescription, Cart, CartItem, Order, OrderItem, Review, WishlistItem, Notification, StockLog, SystemSetting


class RegisterSerializer(serializers.Serializer):
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
    class Meta:
        model = User
        fields = [
            'id', 'full_name', 'email', 'phone', 'dob', 'gender',
            'blood_group', 'allergies', 'avatar_url', 'role', 'is_active',
            'is_email_verified', 'notif_order_updates',
            'notif_prescription_alerts', 'notif_promotions',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'email', 'role', 'is_active', 'is_email_verified', 'created_at', 'updated_at']


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


class MedicineListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Medicine
        fields = [
            'id', 'name', 'brand', 'price', 'original_price', 'type',
            'in_stock', 'stock_quantity', 'image_url', 'rating',
            'total_reviews', 'category', 'category_name',
        ]


class MedicineDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Medicine
        fields = [
            'id', 'name', 'brand', 'description', 'dosage', 'usage',
            'side_effects', 'price', 'original_price', 'type', 'in_stock',
            'package_size', 'manufacturer', 'image_url', 'stock_quantity',
            'expiry_date', 'rating', 'total_reviews', 'category', 'category_id',
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

    class Meta:
        model = Order
        fields = [
            'id', 'user', 'status', 'total_amount', 'delivery_charge', 'discount',
            'payment_method', 'payment_status', 'notes', 'order_rating', 'order_comment',
            'placed_at', 'updated_at', 'items', 'shipping_address', 'prescription',
        ]
        read_only_fields = ['id', 'placed_at', 'updated_at']

    def get_user(self, obj):
        return {
            'id': str(obj.user_id), 'full_name': obj.user.full_name,
            'email': obj.user.email, 'phone': obj.user.phone,
        }


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
