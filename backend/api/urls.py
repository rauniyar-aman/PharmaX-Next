from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # Auth
    path('auth/register/',         views.RegisterView.as_view(),        name='register'),
    path('auth/verify-email/',     views.VerifyEmailView.as_view(),     name='verify-email'),
    path('auth/resend-otp/',       views.ResendOTPView.as_view(),       name='resend-otp'),
    path('auth/login/',            views.LoginView.as_view(),           name='login'),
    path('auth/token/refresh/',    TokenRefreshView.as_view(),          name='token-refresh'),
    path('auth/me/',               views.MeView.as_view(),              name='me'),
    path('auth/avatar/',           views.AvatarUploadView.as_view(),    name='avatar-upload'),
    path('auth/deactivate/',       views.DeactivateAccountView.as_view(), name='deactivate-account'),
    path('auth/restore-request/',  views.RestoreRequestView.as_view(),  name='restore-request'),
    path('auth/restore-confirm/',  views.RestoreConfirmView.as_view(),  name='restore-confirm'),
    path('auth/forgot-password/',  views.ForgotPasswordView.as_view(),  name='forgot-password'),
    path('auth/reset-password/',   views.ResetPasswordView.as_view(),   name='reset-password'),
    path('auth/change-password/',  views.ChangePasswordView.as_view(),  name='change-password'),

    # Public catalog
    path('settings/',                      views.PublicSettingsView.as_view(),     name='public-settings'),
    path('categories/',                    views.CategoryListView.as_view(),       name='categories'),
    path('medicines/my-reviews/',          views.MyReviewsView.as_view(),          name='my-reviews'),
    path('medicines/brands/',              views.MedicineBrandsView.as_view(),     name='medicine-brands'),
    path('medicines/',                     views.MedicineListView.as_view(),       name='medicines'),
    path('medicines/<uuid:pk>/',           views.MedicineDetailView.as_view(),     name='medicine-detail'),
    path('medicines/<uuid:pk>/reviews/',   views.MedicineReviewsView.as_view(),    name='medicine-reviews'),

    # Cart
    path('cart/',                  views.CartView.as_view(),      name='cart'),
    path('cart/items/',            views.CartItemView.as_view(),  name='cart-items'),
    path('cart/items/<uuid:pk>/',  views.CartItemView.as_view(),  name='cart-item-detail'),

    # Wishlist
    path('wishlist/',                          views.WishlistView.as_view(),     name='wishlist'),
    path('wishlist/<uuid:medicine_id>/',       views.WishlistItemView.as_view(), name='wishlist-item'),

    # Addresses
    path('addresses/',          views.AddressListView.as_view(),   name='addresses'),
    path('addresses/<uuid:pk>/', views.AddressDetailView.as_view(), name='address-detail'),

    # Prescriptions
    path('prescriptions/',          views.PrescriptionListView.as_view(),   name='prescriptions'),
    path('prescriptions/<uuid:pk>/', views.PrescriptionDetailView.as_view(), name='prescription-detail'),

    # Orders
    path('orders/',          views.OrderListView.as_view(),   name='orders'),
    path('orders/<uuid:pk>/', views.OrderDetailView.as_view(), name='order-detail'),
    path('orders/<uuid:pk>/cancel/', views.OrderCancelView.as_view(), name='order-cancel'),
    path('orders/<uuid:pk>/rate/',   views.OrderRateView.as_view(),   name='order-rate'),

    # Payment
    path('payment/cod/place/',        views.PaymentCodPlaceView.as_view(),     name='payment-cod-place'),
    path('payment/esewa/initiate/',   views.PaymentEsewaInitiateView.as_view(), name='payment-esewa-initiate'),
    path('payment/esewa/success/',    views.EsewaSuccessView.as_view(),        name='payment-esewa-success'),
    path('payment/esewa/failure/',    views.EsewaFailureView.as_view(),        name='payment-esewa-failure'),
    path('payment/khalti/initiate/',  views.PaymentKhaltiInitiateView.as_view(), name='payment-khalti-initiate'),
    path('payment/khalti/verify/',    views.KhaltiVerifyView.as_view(),        name='payment-khalti-verify'),

    # Notifications
    path('notifications/',            views.NotificationListView.as_view(),   name='notifications'),
    path('notifications/read-all/',   views.NotificationReadAllView.as_view(), name='notifications-read-all'),
    path('notifications/clear-all/',  views.NotificationClearAllView.as_view(), name='notifications-clear-all'),
    path('notifications/<uuid:pk>/',  views.NotificationReadView.as_view(),   name='notification-detail'),

    # Lab Tests
    path('lab-tests/categories/',       views.LabTestCategoryListView.as_view(), name='lab-test-categories'),
    path('lab-tests/bookings/',         views.LabTestBookingListCreateView.as_view(), name='lab-test-bookings'),
    path('lab-tests/bookings/<uuid:pk>/', views.LabTestBookingDetailView.as_view(), name='lab-test-booking-detail'),
    path('lab-tests/',                  views.LabTestListView.as_view(),      name='lab-tests'),
    path('lab-tests/<uuid:pk>/',        views.LabTestDetailView.as_view(),    name='lab-test-detail'),

    # Blog
    path('blog/categories/',            views.BlogCategoryListView.as_view(), name='blog-categories'),
    path('blog/',                       views.BlogPostListView.as_view(),     name='blog-posts'),
    path('blog/<slug:slug>/',           views.BlogPostDetailView.as_view(),   name='blog-post-detail'),

    # Subscriptions
    path('subscriptions/',              views.SubscriptionListCreateView.as_view(), name='subscriptions'),
    path('subscriptions/<uuid:pk>/',    views.SubscriptionDetailView.as_view(), name='subscription-detail'),

    # Doctor Consult
    path('doctors/specialties/',        views.DoctorSpecialtyListView.as_view(), name='doctor-specialties'),
    path('doctors/appointments/',       views.AppointmentListCreateView.as_view(), name='appointments'),
    path('doctors/appointments/<uuid:pk>/', views.AppointmentDetailView.as_view(), name='appointment-detail'),
    path('doctors/my-reviews/',         views.MyDoctorReviewsView.as_view(),  name='my-doctor-reviews'),
    path('doctors/',                    views.DoctorListView.as_view(),       name='doctors'),
    path('doctors/<uuid:pk>/',          views.DoctorDetailView.as_view(),     name='doctor-detail'),
    path('doctors/<uuid:pk>/reviews/',  views.DoctorReviewsView.as_view(),    name='doctor-reviews'),

    # PharmaX Plus
    path('plus/plans/',                 views.PlusPlanListView.as_view(),     name='plus-plans'),
    path('plus/membership/',            views.PlusMembershipView.as_view(),   name='plus-membership'),

    # Coupons
    path('coupons/validate/',           views.CouponValidateView.as_view(),   name='coupon-validate'),

    # Wallet
    path('wallet/',                     views.WalletView.as_view(),           name='wallet'),

    # Referrals
    path('referrals/',                  views.ReferralView.as_view(),         name='referrals'),

    # Health Locker
    path('health-records/',             views.HealthRecordListCreateView.as_view(), name='health-records'),
    path('health-records/<uuid:pk>/',   views.HealthRecordDetailView.as_view(), name='health-record-detail'),

    # Medicine Reminders
    path('reminders/today/',            views.ReminderTodayView.as_view(),    name='reminders-today'),
    path('reminders/',                  views.ReminderListCreateView.as_view(), name='reminders'),
    path('reminders/<uuid:pk>/',        views.ReminderDetailView.as_view(),   name='reminder-detail'),
    path('reminders/<uuid:pk>/mark-taken/', views.ReminderMarkTakenView.as_view(), name='reminder-mark-taken'),

    # Admin
    path('admin/dashboard/',                    views.AdminDashboardView.as_view(),         name='admin-dashboard'),
    path('admin/reports/',                      views.AdminReportsView.as_view(),           name='admin-reports'),
    path('admin/settings/',                     views.AdminSettingsView.as_view(),          name='admin-settings'),
    path('admin/categories/',                   views.AdminCategoryListView.as_view(),      name='admin-categories'),
    path('admin/categories/<uuid:pk>/',         views.AdminCategoryDetailView.as_view(),    name='admin-category-detail'),
    path('admin/brands/',                       views.AdminBrandListView.as_view(),         name='admin-brands'),
    path('admin/brands/<uuid:pk>/',             views.AdminBrandDetailView.as_view(),       name='admin-brand-detail'),
    path('admin/lab-test-categories/',          views.AdminLabTestCategoryListView.as_view(), name='admin-lab-test-categories'),
    path('admin/lab-test-categories/<uuid:pk>/', views.AdminLabTestCategoryDetailView.as_view(), name='admin-lab-test-category-detail'),
    path('admin/lab-tests/',                    views.AdminLabTestListView.as_view(),       name='admin-lab-tests'),
    path('admin/lab-tests/<uuid:pk>/',          views.AdminLabTestDetailView.as_view(),     name='admin-lab-test-detail'),
    path('admin/lab-test-bookings/',            views.AdminLabTestBookingListView.as_view(), name='admin-lab-test-bookings'),
    path('admin/lab-test-bookings/<uuid:pk>/',  views.AdminLabTestBookingDetailView.as_view(), name='admin-lab-test-booking-detail'),
    path('admin/blog/',                         views.AdminBlogPostListView.as_view(),      name='admin-blog-posts'),
    path('admin/blog/<uuid:pk>/',               views.AdminBlogPostDetailView.as_view(),    name='admin-blog-post-detail'),
    path('admin/subscriptions/',                views.AdminSubscriptionListView.as_view(),  name='admin-subscriptions'),
    path('admin/subscriptions/<uuid:pk>/renew/', views.AdminSubscriptionRenewView.as_view(), name='admin-subscription-renew'),
    path('admin/doctors/',                      views.AdminDoctorListView.as_view(),        name='admin-doctors'),
    path('admin/doctors/<uuid:pk>/',            views.AdminDoctorDetailView.as_view(),      name='admin-doctor-detail'),
    path('admin/appointments/',                 views.AdminAppointmentListView.as_view(),   name='admin-appointments'),
    path('admin/appointments/<uuid:pk>/',       views.AdminAppointmentDetailView.as_view(), name='admin-appointment-detail'),
    path('admin/plus-plans/',                   views.AdminPlusPlanListView.as_view(),      name='admin-plus-plans'),
    path('admin/plus-plans/<uuid:pk>/',         views.AdminPlusPlanDetailView.as_view(),    name='admin-plus-plan-detail'),
    path('admin/plus-memberships/',             views.AdminPlusMembershipListView.as_view(), name='admin-plus-memberships'),
    path('admin/coupons/',                      views.AdminCouponListView.as_view(),        name='admin-coupons'),
    path('admin/coupons/<uuid:pk>/',            views.AdminCouponDetailView.as_view(),      name='admin-coupon-detail'),
    path('admin/wallets/',                      views.AdminWalletListView.as_view(),        name='admin-wallets'),
    path('admin/wallets/adjust/',               views.AdminWalletAdjustView.as_view(),      name='admin-wallet-adjust'),
    path('admin/medicines/',                    views.AdminMedicineListView.as_view(),      name='admin-medicines'),
    path('admin/medicines/upload-image/',       views.AdminMedicineImageUploadView.as_view(), name='admin-medicine-image-upload'),
    path('admin/medicines/<uuid:pk>/',          views.AdminMedicineDetailView.as_view(),    name='admin-medicine-detail'),
    path('admin/orders/',                       views.AdminOrderListView.as_view(),         name='admin-orders'),
    path('admin/orders/<uuid:pk>/',             views.AdminOrderDetailView.as_view(),       name='admin-order-detail'),
    path('admin/prescriptions/',                views.AdminPrescriptionListView.as_view(),  name='admin-prescriptions'),
    path('admin/prescriptions/<uuid:pk>/',      views.AdminPrescriptionDetailView.as_view(), name='admin-prescription-detail'),
    path('admin/customers/',                    views.AdminCustomerListView.as_view(),      name='admin-customers'),
    path('admin/customers/<uuid:pk>/',          views.AdminCustomerDetailView.as_view(),    name='admin-customer-detail'),
    path('admin/customers/<uuid:pk>/block/',    views.AdminCustomerBlockView.as_view(),     name='admin-customer-block'),
    path('admin/inventory/',                    views.AdminInventoryView.as_view(),         name='admin-inventory'),
    path('admin/inventory/<uuid:pk>/',          views.AdminInventoryView.as_view(),         name='admin-inventory-detail'),
    path('admin/inventory/<uuid:pk>/log/',      views.AdminStockLogView.as_view(),          name='admin-inventory-log'),
    path('admin/permissions/',                  views.PermissionListView.as_view(),         name='admin-permissions'),
    path('admin/admins/',                       views.AdminUserListView.as_view(),          name='admin-users'),
    path('admin/admins/<uuid:pk>/',             views.AdminUserDetailView.as_view(),        name='admin-user-detail'),
]
