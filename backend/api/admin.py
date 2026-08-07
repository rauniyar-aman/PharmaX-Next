from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    User, Address, Category, Brand, Medicine, Prescription,
    Cart, CartItem, Order, OrderItem, Review, WishlistItem,
    Notification, SystemSetting,
    LabTestCategory, LabTest, LabTestBooking, BlogPost, MedicineSubscription,
    Doctor, DoctorAppointment, PlusPlan, PlusMembership,
    DoctorReview, HealthRecord, MedicineReminder, ReminderLog,
    Coupon, CouponUsage, Wallet, WalletTransaction, Referral,
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


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ('name', 'brand', 'type', 'price', 'in_stock', 'stock_quantity', 'category', 'rating')
    list_filter = ('type', 'in_stock', 'category', 'brand')
    search_fields = ('name', 'brand__name', 'manufacturer')


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


@admin.register(LabTestCategory)
class LabTestCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name',)


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'sample_type', 'price', 'is_package', 'is_active')
    list_filter = ('category', 'sample_type', 'is_package', 'is_active')
    search_fields = ('name',)


@admin.register(LabTestBooking)
class LabTestBookingAdmin(admin.ModelAdmin):
    list_display = ('lab_test', 'user', 'scheduled_date', 'time_slot', 'status', 'total_amount')
    list_filter = ('status',)
    search_fields = ('user__email', 'lab_test__name')


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'author', 'is_published', 'published_at')
    list_filter = ('is_published', 'category')
    search_fields = ('title',)


@admin.register(MedicineSubscription)
class MedicineSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('medicine', 'user', 'quantity', 'frequency_days', 'next_delivery_date', 'is_active')
    list_filter = ('is_active', 'frequency_days')
    search_fields = ('user__email', 'medicine__name')


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('name', 'specialty', 'consultation_fee', 'is_active')
    list_filter = ('specialty', 'is_active')
    search_fields = ('name', 'specialty')


@admin.register(DoctorAppointment)
class DoctorAppointmentAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'user', 'scheduled_date', 'time_slot', 'status', 'fee_amount')
    list_filter = ('status',)
    search_fields = ('user__email', 'doctor__name')


@admin.register(PlusPlan)
class PlusPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'duration_days', 'price', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(PlusMembership)
class PlusMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'started_at', 'expires_at', 'price_paid')
    list_filter = ('plan',)
    search_fields = ('user__email',)


@admin.register(DoctorReview)
class DoctorReviewAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'user', 'rating', 'created_at')
    list_filter = ('rating',)
    search_fields = ('user__email', 'doctor__name')


@admin.register(HealthRecord)
class HealthRecordAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'record_type', 'record_date', 'uploaded_at')
    list_filter = ('record_type',)
    search_fields = ('title', 'user__email')


@admin.register(MedicineReminder)
class MedicineReminderAdmin(admin.ModelAdmin):
    list_display = ('medicine_name', 'user', 'frequency', 'times', 'is_active')
    list_filter = ('frequency', 'is_active')
    search_fields = ('medicine_name', 'user__email')


admin.site.register(ReminderLog)


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount_type', 'discount_value', 'is_active', 'valid_from', 'valid_until')
    list_filter = ('discount_type', 'is_active')
    search_fields = ('code',)


admin.site.register(CouponUsage)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('user', 'balance', 'updated_at')
    search_fields = ('user__email',)


admin.site.register(WalletTransaction)


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ('referrer', 'referred_user', 'status', 'reward_amount', 'created_at')
    list_filter = ('status',)
    search_fields = ('referrer__email', 'referred_user__email')


admin.site.register(Address)
admin.site.register(Cart)
admin.site.register(CartItem)
admin.site.register(OrderItem)
admin.site.register(WishlistItem)
