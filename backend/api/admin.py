from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    User, Address, Category, Medicine, Prescription,
    Cart, CartItem, Order, OrderItem, Review, WishlistItem,
    Notification, SystemSetting,
)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'full_name', 'phone', 'role', 'is_email_verified', 'is_active', 'created_at')
    list_filter = ('role', 'is_email_verified', 'is_active', 'is_deleted')
    search_fields = ('email', 'full_name', 'phone')
    ordering = ('-created_at',)
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal', {'fields': ('full_name', 'phone', 'dob', 'gender', 'blood_group', 'allergies', 'avatar_url')}),
        ('Status', {'fields': ('role', 'is_email_verified', 'is_active', 'is_staff', 'is_superuser', 'is_deleted', 'deleted_at')}),
        ('OTP', {'fields': ('otp_code', 'otp_expires_at', 'otp_attempts', 'otp_locked_until')}),
        ('Notifications', {'fields': ('notif_order_updates', 'notif_prescription_alerts', 'notif_promotions')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'full_name', 'phone', 'password1', 'password2', 'role')}),
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ('name', 'brand', 'type', 'price', 'in_stock', 'stock_quantity', 'category', 'rating')
    list_filter = ('type', 'in_stock', 'category')
    search_fields = ('name', 'brand', 'manufacturer')


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'status', 'doctor', 'hospital', 'uploaded_at')
    list_filter = ('status',)
    search_fields = ('user__email',)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'status', 'total_amount', 'payment_status', 'placed_at')
    list_filter = ('status', 'payment_status')
    search_fields = ('user__email',)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('user', 'medicine', 'rating', 'created_at')
    list_filter = ('rating',)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'type', 'is_read', 'created_at')
    list_filter = ('type', 'is_read')


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'updated_at')


admin.site.register(Address)
admin.site.register(Cart)
admin.site.register(CartItem)
admin.site.register(OrderItem)
admin.site.register(WishlistItem)
