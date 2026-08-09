from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from uuid import uuid4
from decimal import Decimal


class UserManager(BaseUserManager):
    def create_user(self, email, full_name, phone, password=None, **extra):
        if not email:
            raise ValueError('Email is required')
        user = self.model(email=self.normalize_email(email), full_name=full_name, phone=phone, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, phone, password=None, **extra):
        extra.setdefault('role', 'ADMIN')
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(email, full_name, phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    ROLES = [('CUSTOMER', 'Customer'), ('ADMIN', 'Admin'), ('PHARMACY', 'Pharmacy'), ('DELIVERY_AGENT', 'Delivery Agent')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, unique=True)
    dob = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)
    blood_group = models.CharField(max_length=10, null=True, blank=True)
    allergies = models.TextField(null=True, blank=True)
    avatar_url = models.CharField(max_length=500, null=True, blank=True)
    referral_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLES, default='CUSTOMER')
    is_super_admin = models.BooleanField(default=False)
    permissions = models.ManyToManyField('Permission', blank=True, related_name='users', db_table='user_permissions')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_email_verified = models.BooleanField(default=False)
    otp_code = models.CharField(max_length=6, null=True, blank=True)
    otp_expires_at = models.DateTimeField(null=True, blank=True)
    otp_attempts = models.IntegerField(default=0)
    otp_locked_until = models.DateTimeField(null=True, blank=True)
    notif_order_updates = models.BooleanField(default=True)
    notif_prescription_alerts = models.BooleanField(default=True)
    notif_promotions = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name', 'phone']

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email


class Permission(models.Model):
    """A single grantable admin capability. Seeded once via data migration — not user-editable."""
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    code = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=150)
    group = models.CharField(max_length=50)
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'permissions'
        ordering = ['group', 'label']

    def __str__(self):
        return self.label


class Address(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    label = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    city = models.CharField(max_length=100)
    province = models.CharField(max_length=100)
    zip = models.CharField(max_length=20)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = 'addresses'

    def __str__(self):
        return f'{self.label} — {self.user.email}'


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(max_length=100, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'categories'
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class Brand(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    manufacturer = models.CharField(max_length=255, null=True, blank=True)
    logo_url = models.CharField(max_length=500, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'brands'

    def __str__(self):
        return self.name


class Medicine(models.Model):
    TYPES = [('Rx', 'Prescription'), ('OTC', 'Over the Counter')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name='medicines')
    description = models.TextField(null=True, blank=True)
    dosage = models.CharField(max_length=100, null=True, blank=True)
    usage = models.TextField(null=True, blank=True)
    side_effects = models.TextField(null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    original_price = models.DecimalField(max_digits=10, decimal_places=2)
    type = models.CharField(max_length=3, choices=TYPES)
    in_stock = models.BooleanField(default=True)
    package_size = models.CharField(max_length=100, null=True, blank=True)
    manufacturer = models.CharField(max_length=255, null=True, blank=True)
    image_url = models.CharField(max_length=500, null=True, blank=True)
    stock_quantity = models.IntegerField(default=0)
    expiry_date = models.DateField(null=True, blank=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal('0'))
    total_reviews = models.IntegerField(default=0)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='medicines')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'medicines'

    def __str__(self):
        return f'{self.name} ({self.brand})'


class Prescription(models.Model):
    STATUS = [
        ('PENDING', 'Pending'),
        ('VERIFIED', 'Verified'),
        ('REJECTED', 'Rejected'),
        ('EXPIRED', 'Expired'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='prescriptions')
    file = models.FileField(upload_to='prescriptions/', null=True, blank=True)
    file_name = models.CharField(max_length=255, blank=True, default='')
    file_url = models.CharField(max_length=500, blank=True, default='')
    notes = models.TextField(null=True, blank=True)
    doctor = models.CharField(max_length=255, null=True, blank=True)
    hospital = models.CharField(max_length=255, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    rejection_reason = models.TextField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    checkout_draft = models.BooleanField(default=False)

    class Meta:
        db_table = 'prescriptions'

    def __str__(self):
        return f'{self.user.email} — {self.status}'


class Cart(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='cart')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'carts'

    def __str__(self):
        return f'Cart of {self.user.email}'


class CartItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='cart_items')
    quantity = models.IntegerField(default=1)

    class Meta:
        db_table = 'cart_items'
        unique_together = ('cart', 'medicine')
        # Without this, cart.items.all() has no guaranteed row order — Postgres is free to return
        # rows differently across queries (an UPDATE can change scan order), which made the cart
        # page's item cards appear to reshuffle position whenever any single item's quantity
        # changed, looking exactly like "one item's change is affecting every item."
        ordering = ['id']

    def __str__(self):
        return f'{self.medicine.name} x{self.quantity}'


class Order(models.Model):
    ORDER_STATUS = [
        ('BROADCASTING', 'Broadcasting'),
        ('AWAITING_PAYMENT', 'Awaiting Payment'),
        ('NO_PHARMACY_FOUND', 'No Pharmacy Found'),
        ('PLACED', 'Placed'),
        ('CONFIRMED', 'Confirmed'),
        ('PROCESSING', 'Processing'),
        ('SHIPPED', 'Shipped'),
        ('OUT_FOR_DELIVERY', 'Out for Delivery'),
        ('DELIVERED', 'Delivered'),
        ('CANCELLED', 'Cancelled'),
        ('RETURNED', 'Returned'),
    ]
    PAYMENT_STATUS = [
        ('PENDING', 'Pending'),
        ('PAID', 'Paid'),
        ('FAILED', 'Failed'),
        ('REFUNDED', 'Refunded'),
    ]

    SOURCE = [('CART', 'Cart'), ('DIRECT', 'Buy Now')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='orders')
    address = models.ForeignKey(Address, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    prescription = models.ForeignKey(Prescription, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    status = models.CharField(max_length=20, choices=ORDER_STATUS, default='PLACED')
    # CART orders are built from (and clear) the user's persisted Cart on placement; DIRECT
    # ("Buy Now") orders are built from an explicit item list and must NEVER clear the cart —
    # see sync_order_status()'s PLACED transition, which checks this before deleting cart items.
    source = models.CharField(max_length=10, choices=SOURCE, default='CART')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    coupon = models.ForeignKey('Coupon', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    wallet_used = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='PENDING')
    esewa_transaction_uuid = models.CharField(max_length=100, null=True, blank=True, unique=True)
    khalti_pidx = models.CharField(max_length=100, null=True, blank=True, unique=True)
    notes = models.TextField(null=True, blank=True)
    order_rating = models.IntegerField(null=True, blank=True)
    order_comment = models.TextField(null=True, blank=True)
    placed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'orders'

    def __str__(self):
        return f'Order {self.id} — {self.user.email}'


class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name='order_items')
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    prescription = models.ForeignKey(Prescription, on_delete=models.SET_NULL, null=True, blank=True, related_name='order_items')
    fulfillment = models.ForeignKey('OrderFulfillment', on_delete=models.SET_NULL, null=True, blank=True, related_name='order_items')

    class Meta:
        db_table = 'order_items'

    def __str__(self):
        return f'{self.medicine.name} x{self.quantity}'


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField()
    comment = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'reviews'
        unique_together = ('user', 'medicine')

    def __str__(self):
        return f'{self.user.email} — {self.medicine.name} ({self.rating}★)'


class WishlistItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='wishlist')
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='wishlist_items')
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wishlist_items'
        unique_together = ('user', 'medicine')

    def __str__(self):
        return f'{self.user.email} — {self.medicine.name}'


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    link = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'

    def __str__(self):
        return f'{self.title} — {self.user.email}'


class StockLog(models.Model):
    ACTIONS = [('ADD', 'Stock Added'), ('SUBTRACT', 'Stock Subtracted'), ('SET', 'Stock Set')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='stock_logs')
    admin = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_logs')
    action = models.CharField(max_length=20, choices=ACTIONS)
    quantity_before = models.IntegerField()
    quantity_change = models.IntegerField()
    quantity_after = models.IntegerField()
    note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'stock_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.medicine.name} {self.action} by {self.quantity_change}'


class LabTestCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    icon = models.CharField(max_length=100, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lab_test_categories'
        verbose_name_plural = 'lab test categories'

    def __str__(self):
        return self.name


class LabTest(models.Model):
    SAMPLE_TYPES = [('BLOOD', 'Blood'), ('URINE', 'Urine'), ('SWAB', 'Swab'), ('OTHER', 'Other')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    category = models.ForeignKey(LabTestCategory, on_delete=models.PROTECT, related_name='lab_tests')
    description = models.TextField(null=True, blank=True)
    parameters_included = models.TextField(null=True, blank=True)
    sample_type = models.CharField(max_length=10, choices=SAMPLE_TYPES, default='BLOOD')
    fasting_required = models.BooleanField(default=False)
    reporting_time = models.CharField(max_length=100, null=True, blank=True)
    is_package = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    original_price = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    total_bookings = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lab_tests'

    def __str__(self):
        return self.name


class LabTestBooking(models.Model):
    STATUS = [
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('SAMPLE_COLLECTED', 'Sample Collected'),
        ('REPORT_READY', 'Report Ready'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='lab_test_bookings')
    lab_test = models.ForeignKey(LabTest, on_delete=models.PROTECT, related_name='bookings')
    address = models.ForeignKey(Address, on_delete=models.SET_NULL, null=True, blank=True, related_name='lab_test_bookings')
    scheduled_date = models.DateField()
    time_slot = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(null=True, blank=True)
    report_url = models.CharField(max_length=500, null=True, blank=True)
    booked_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lab_test_bookings'
        ordering = ['-booked_at']

    def __str__(self):
        return f'{self.lab_test.name} — {self.user.email} ({self.status})'


class BlogPost(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=280, unique=True, blank=True)
    category = models.CharField(max_length=100, null=True, blank=True)
    cover_image_url = models.CharField(max_length=500, null=True, blank=True)
    excerpt = models.TextField(null=True, blank=True)
    content = models.TextField()
    author = models.CharField(max_length=255, default='PharmaX Team')
    is_published = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'blog_posts'
        ordering = ['-published_at', '-created_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            base = slugify(self.title)[:260] or 'post'
            slug = base
            n = 1
            while BlogPost.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                n += 1
                slug = f'{base}-{n}'
            self.slug = slug
        if self.is_published and not self.published_at:
            from django.utils import timezone
            self.published_at = timezone.now()
        super().save(*args, **kwargs)


class MedicineSubscription(models.Model):
    FREQUENCY_CHOICES = [
        (7, 'Weekly'),
        (15, 'Every 15 Days'),
        (30, 'Monthly'),
        (60, 'Every 2 Months'),
        (90, 'Every 3 Months'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='subscriptions')
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name='subscriptions')
    address = models.ForeignKey(Address, on_delete=models.SET_NULL, null=True, blank=True, related_name='subscriptions')
    quantity = models.IntegerField(default=1)
    frequency_days = models.IntegerField(choices=FREQUENCY_CHOICES, default=30)
    is_active = models.BooleanField(default=True)
    next_delivery_date = models.DateField()
    last_delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'medicine_subscriptions'
        ordering = ['next_delivery_date']

    def __str__(self):
        return f'{self.medicine.name} — {self.user.email} (every {self.frequency_days}d)'


class Doctor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    specialty = models.CharField(max_length=100)
    qualification = models.CharField(max_length=255, null=True, blank=True)
    experience_years = models.IntegerField(default=0)
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2)
    photo_url = models.CharField(max_length=500, null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    languages = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal('0'))
    total_reviews = models.IntegerField(default=0)
    total_consultations = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctors'

    def __str__(self):
        return f'Dr. {self.name} ({self.specialty})'


class DoctorAppointment(models.Model):
    STATUS = [
        ('PENDING', 'Pending'),
        ('CONFIRMED', 'Confirmed'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='appointments')
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name='appointments')
    scheduled_date = models.DateField()
    time_slot = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(null=True, blank=True)
    meeting_link = models.CharField(max_length=500, null=True, blank=True)
    booked_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctor_appointments'
        ordering = ['-booked_at']

    def __str__(self):
        return f'Dr. {self.doctor.name} — {self.user.email} ({self.status})'


class DoctorReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_reviews')
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField()
    comment = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'doctor_reviews'
        unique_together = ('user', 'doctor')

    def __str__(self):
        return f'{self.user.email} — Dr. {self.doctor.name} ({self.rating}★)'


class PlusPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=100)
    duration_days = models.IntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'plus_plans'
        ordering = ['duration_days']

    def __str__(self):
        return f'{self.name} (NPR {self.price})'


class PlusMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='plus_membership')
    plan = models.ForeignKey(PlusPlan, on_delete=models.PROTECT, related_name='memberships')
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    price_paid = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'plus_memberships'

    @property
    def is_active(self):
        from django.utils import timezone
        return self.expires_at > timezone.now()

    def __str__(self):
        return f'{self.user.email} — {self.plan.name} (expires {self.expires_at.date()})'


class HealthRecord(models.Model):
    RECORD_TYPES = [
        ('PRESCRIPTION', 'Prescription'),
        ('LAB_REPORT', 'Lab Report'),
        ('VACCINATION', 'Vaccination Certificate'),
        ('DISCHARGE_SUMMARY', 'Discharge Summary'),
        ('OTHER', 'Other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='health_records')
    title = models.CharField(max_length=255)
    record_type = models.CharField(max_length=30, choices=RECORD_TYPES, default='OTHER')
    file = models.FileField(upload_to='health_records/', null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    record_date = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'health_records'
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.title} — {self.user.email}'


class MedicineReminder(models.Model):
    FREQUENCY_CHOICES = [('DAILY', 'Daily'), ('WEEKLY', 'Weekly'), ('MONTHLY', 'Monthly'), ('AS_NEEDED', 'As Needed')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='medicine_reminders')
    medicine = models.ForeignKey(Medicine, on_delete=models.SET_NULL, null=True, blank=True, related_name='reminders')
    medicine_name = models.CharField(max_length=255)
    dosage = models.CharField(max_length=100, null=True, blank=True)
    times = models.CharField(max_length=255, help_text='Comma-separated 24h times, e.g. "08:00,14:00,20:00"')
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='DAILY')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'medicine_reminders'
        ordering = ['medicine_name']

    def __str__(self):
        return f'{self.medicine_name} — {self.user.email}'


class ReminderLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    reminder = models.ForeignKey(MedicineReminder, on_delete=models.CASCADE, related_name='logs')
    scheduled_date = models.DateField()
    scheduled_time = models.CharField(max_length=10)
    taken_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'reminder_logs'
        unique_together = ('reminder', 'scheduled_date', 'scheduled_time')

    def __str__(self):
        return f'{self.reminder.medicine_name} — {self.scheduled_date} {self.scheduled_time}'


class Coupon(models.Model):
    DISCOUNT_TYPES = [('PERCENTAGE', 'Percentage'), ('FLAT', 'Flat Amount')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    code = models.CharField(max_length=30, unique=True)
    description = models.CharField(max_length=255, null=True, blank=True)
    discount_type = models.CharField(max_length=20, choices=DISCOUNT_TYPES, default='PERCENTAGE')
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    max_discount_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    usage_limit = models.IntegerField(null=True, blank=True, help_text='Total redemptions allowed. Blank = unlimited.')
    per_user_limit = models.IntegerField(default=1)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'coupons'
        ordering = ['-created_at']

    def __str__(self):
        return self.code


class CouponUsage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name='usages')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='coupon_usages')
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='coupon_usage')
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coupon_usages'

    def __str__(self):
        return f'{self.coupon.code} — {self.user.email}'


class Wallet(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'wallets'

    def __str__(self):
        return f'{self.user.email} — NPR {self.balance}'


class WalletTransaction(models.Model):
    TYPES = [('CREDIT', 'Credit'), ('DEBIT', 'Debit')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=TYPES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=255)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_transactions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wallet_transactions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.wallet.user.email} — {self.type} NPR {self.amount}'


class Referral(models.Model):
    STATUS = [('PENDING', 'Pending'), ('REWARDED', 'Rewarded')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    referrer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='referrals_made')
    referred_user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='referred_by_record')
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    reward_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    rewarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'referrals'

    def __str__(self):
        return f'{self.referrer.email} → {self.referred_user.email} ({self.status})'


class SystemSetting(models.Model):
    key = models.CharField(max_length=100, primary_key=True)
    value = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_settings'

    def __str__(self):
        return self.key


# ─── Marketplace: Pharmacies & Delivery ────────────────────────────────────────

class Pharmacy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='pharmacy')  # login identity
    name = models.CharField(max_length=255)
    license_number = models.CharField(max_length=100, unique=True)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    lat = models.FloatField()
    lng = models.FloatField()
    logo_url = models.CharField(max_length=500, null=True, blank=True)
    is_verified = models.BooleanField(default=False)   # admin must verify before it can receive orders
    # pharmacy's own go-online/offline switch — broadcast_order() only offers new requests to
    # pharmacies where is_verified AND is_active are both true, so flipping this off is a real,
    # immediate "stop sending me requests" lever, not just a display flag.
    is_active = models.BooleanField(default=True)

    # The pharmacy's designated point of contact — not necessarily the same person as the login
    # owner (Pharmacy.user), e.g. a manager who isn't the account holder.
    contact_person_name = models.CharField(max_length=255, null=True, blank=True)
    contact_person_phone = models.CharField(max_length=20, null=True, blank=True)

    # Payout destination — self-reported by the pharmacy, used by admin's manual bank transfer
    # when marking a PharmacyPayout paid. Not validated against any bank API.
    bank_name = models.CharField(max_length=255, null=True, blank=True)
    bank_account_holder_name = models.CharField(max_length=255, null=True, blank=True)
    bank_account_number = models.CharField(max_length=50, null=True, blank=True)
    bank_branch = models.CharField(max_length=255, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pharmacies'

    def __str__(self):
        return self.name


class PharmacyDocument(models.Model):
    """Compliance/KYC documents for a pharmacy. PAN_CARD and CITIZENSHIP are uploaded by the
    pharmacy itself (proof of identity/tax registration); MOU and CANCELLED_CHEQUE are uploaded
    by the PharmaX admin team (the signed agreement, and proof of the bank account for payouts) —
    who's allowed to upload which type is enforced in the view layer, not here. One row per
    (pharmacy, doc_type): re-uploading replaces the previous file rather than accumulating a
    history, since only the current document matters for compliance."""
    DOC_TYPES = [
        ('PAN_CARD', 'PAN Card'),
        ('CITIZENSHIP', 'Owner Citizenship'),
        ('MOU', 'Signed MOU'),
        ('CANCELLED_CHEQUE', 'Cancelled Cheque'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=20, choices=DOC_TYPES)
    file_url = models.CharField(max_length=500)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    uploaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pharmacy_documents'
        unique_together = ('pharmacy', 'doc_type')

    def __str__(self):
        return f'{self.pharmacy.name} — {self.get_doc_type_display()}'


class PharmacyLocationChangeRequest(models.Model):
    """A pharmacy proposing a new lat/lng, requiring admin approval before it takes effect —
    lat/lng is deliberately locked from direct self-service edit (see PharmacyProfileView), this
    is the reviewed path to actually change it. Only Pharmacy.lat/lng gets updated on approval;
    rejection leaves the pharmacy's current location untouched."""
    STATUS = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='location_change_requests')
    requested_lat = models.FloatField()
    requested_lng = models.FloatField()
    requested_address = models.TextField(blank=True, null=True)
    reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    admin_note = models.TextField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pharmacy_location_change_requests'

    def __str__(self):
        return f'{self.pharmacy.name} — {self.status} ({self.created_at:%Y-%m-%d})'


class PharmacyBusinessHours(models.Model):
    """One row per weekday (0=Monday..6=Sunday) per pharmacy — informational display of when the
    pharmacy is normally open, shown on their profile. Deliberately NOT enforced against
    broadcast_order(): Pharmacy.is_active is the one lever that actually gates incoming requests,
    so a pharmacy that forgets to update these hours can't accidentally lock themselves out of
    orders the way a hard enforcement would."""
    WEEKDAYS = [(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='business_hours')
    weekday = models.IntegerField(choices=WEEKDAYS)
    is_closed = models.BooleanField(default=False)
    open_time = models.TimeField(null=True, blank=True)
    close_time = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = 'pharmacy_business_hours'
        unique_together = ('pharmacy', 'weekday')
        ordering = ['weekday']

    def __str__(self):
        return f'{self.pharmacy.name} — {self.get_weekday_display()}'


class PharmacyTeamMember(models.Model):
    """An additional login a pharmacy owner can grant to help manage requests/orders. The owner's
    own login is Pharmacy.user (OneToOneField) — this model is only for the extra seats beyond
    that, capped at 3 in the view layer. A team member's User row still has role='PHARMACY', so
    IsPharmacy still gates access; get_managed_pharmacy() resolves which pharmacy they act for."""
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='team_members')
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='pharmacy_membership')
    # off by default — income/payout figures are sensitive, so a newly-added staff login can
    # manage requests/orders without seeing money until the owner explicitly grants it.
    can_view_finance = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pharmacy_team_members'

    def __str__(self):
        return f'{self.user.full_name} @ {self.pharmacy.name}'


class PharmacyMedicineListing(models.Model):
    """A pharmacy's claim that they stock a given medicine, with their own batch expiry/stock."""
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='listings')
    medicine = models.ForeignKey(Medicine, on_delete=models.CASCADE, related_name='pharmacy_listings')
    stock_quantity = models.PositiveIntegerField(default=0)
    expiry_date = models.DateField()
    is_available = models.BooleanField(default=True)   # pharmacy can pause a listing without deleting it
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pharmacy_medicine_listings'
        unique_together = ('pharmacy', 'medicine')
        indexes = [models.Index(fields=['medicine', 'is_available'])]

    def __str__(self):
        return f'{self.pharmacy.name} — {self.medicine.name}'


class DeliveryAgent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='delivery_agent')
    phone = models.CharField(max_length=20)
    vehicle_type = models.CharField(max_length=50, blank=True, null=True)  # bike, scooter, etc
    lat = models.FloatField(null=True, blank=True)   # live/last-known location
    lng = models.FloatField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    is_online = models.BooleanField(default=False)    # agent toggles this to receive requests at all
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_agents'

    def __str__(self):
        return self.user.full_name


class OrderFulfillment(models.Model):
    """One pharmacy's slice of an Order. An Order with items split across 2 pharmacies has 2 of these."""
    STATUS = [
        ('BROADCASTING', 'Broadcasting'),      # request sent to nearby pharmacies, awaiting response
        ('ACCEPTED', 'Accepted'),               # pharmacy confirmed, preparing the items
        ('NO_PHARMACY_FOUND', 'No Pharmacy Found'),
        ('PREPARED', 'Prepared'),               # pharmacy has gathered every item
        ('PACKED', 'Packed'),                   # pharmacy has boxed/bagged it, ready to hand off
        # Pharmacy-driven manual stages (ACCEPTED -> PREPARED -> PACKED -> AWAITING_DELIVERY) — see
        # PharmacyOrderAdvanceStatusView. This used to jump straight from ACCEPTED to
        # AWAITING_DELIVERY the instant the order was paid, with zero pharmacy involvement in
        # *when* it became visible to riders; these give the pharmacy real control over that.
        ('AWAITING_DELIVERY', 'Awaiting Delivery'),  # broadcast to nearby riders, needs one to accept
        ('OUT_FOR_DELIVERY', 'Out for Delivery'),
        ('DELIVERED', 'Delivered'),
        ('CANCELLED', 'Cancelled'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='fulfillments')
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.PROTECT, null=True, blank=True, related_name='fulfillments')
    delivery_agent = models.ForeignKey(DeliveryAgent, on_delete=models.SET_NULL, null=True, blank=True, related_name='fulfillments')
    status = models.CharField(max_length=20, choices=STATUS, default='BROADCASTING')
    delivery_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    accepted_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivery_broadcast_at = models.DateTimeField(null=True, blank=True)  # set when broadcast_delivery() runs; used to detect a stale delivery broadcast (no per-agent request model exists to check PENDING-ness against, unlike FulfillmentRequest in Stage 2)

    class Meta:
        db_table = 'order_fulfillments'

    def __str__(self):
        return f'Fulfillment {self.id} — Order {self.order_id}'


class FulfillmentRequest(models.Model):
    """One broadcast: one medicine, from one order, offered to one nearby pharmacy."""
    STATUS = [('PENDING', 'Pending'), ('ACCEPTED', 'Accepted'), ('DECLINED', 'Declined'), ('EXPIRED', 'Expired')]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='fulfillment_requests')
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.CASCADE, related_name='fulfillment_requests')
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fulfillment_requests'
        unique_together = ('order_item', 'pharmacy')

    def __str__(self):
        return f'{self.pharmacy.name} — {self.order_item}'


class PharmacyPayout(models.Model):
    """One payout obligation, created when a fulfillment is DELIVERED — not earlier, to avoid
    paying out on a delivery that could still be cancelled in transit."""
    STATUS = [('PENDING', 'Pending'), ('PAID', 'Paid')]
    FUNDING_SOURCE = [
        ('ORDER_REVENUE', 'Order Revenue'),   # online-paid order — platform actually received this money
        ('PLATFORM_FUNDS', 'Platform Funds'), # COD order — platform is paying out of its own pocket
    ]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    pharmacy = models.ForeignKey(Pharmacy, on_delete=models.PROTECT, related_name='payouts')
    fulfillment = models.OneToOneField(OrderFulfillment, on_delete=models.PROTECT, related_name='pharmacy_payout')
    gross_amount = models.DecimalField(max_digits=10, decimal_places=2)     # medicine subtotal for this fulfillment
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2)   # snapshot at creation time — rate changes later don't rewrite history
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2)
    net_payable = models.DecimalField(max_digits=10, decimal_places=2)      # gross - commission
    funding_source = models.CharField(max_length=20, choices=FUNDING_SOURCE)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pharmacy_payouts'


class DeliveryAgentEarning(models.Model):
    """One earning record per completed delivery — always a real payable the platform owes the
    agent for their delivery work, regardless of payment method. (COD no longer self-settles this —
    see DeliveryAgentCodLiability for the separate, opposite-direction remittance tracking.)"""
    STATUS = [('PENDING', 'Pending'), ('PAID', 'Paid')]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    agent = models.ForeignKey(DeliveryAgent, on_delete=models.PROTECT, related_name='earnings')
    fulfillment = models.OneToOneField(OrderFulfillment, on_delete=models.PROTECT, related_name='agent_earning')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_agent_earnings'


class DeliveryAgentCodLiability(models.Model):
    """The opposite direction from DeliveryAgentEarning: cash the agent is currently holding after
    a COD delivery, which they owe back to the platform via office deposit or gateway top-up. One
    per COD OrderFulfillment. This is what answers 'which agent still owes us money' — it did not
    exist in the prior version of this spec because the business model at the time had agents keep
    the cash permanently; that's been corrected."""
    STATUS = [('PENDING', 'Pending'), ('REMITTED', 'Remitted')]
    METHOD = [('CASH_DEPOSIT', 'Cash Deposit at Office'), ('GATEWAY_TOPUP', 'Gateway Top-up')]
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    agent = models.ForeignKey(DeliveryAgent, on_delete=models.PROTECT, related_name='cod_liabilities')
    fulfillment = models.OneToOneField(OrderFulfillment, on_delete=models.PROTECT, related_name='cod_liability')
    amount_collected = models.DecimalField(max_digits=10, decimal_places=2)  # full COD cash for this leg: medicine + this fulfillment's delivery_charge
    status = models.CharField(max_length=20, choices=STATUS, default='PENDING')
    remittance_method = models.CharField(max_length=20, choices=METHOD, null=True, blank=True)
    reference = models.CharField(max_length=255, null=True, blank=True)  # deposit slip #, gateway transaction id
    remitted_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_agent_cod_liabilities'
