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

    # Admin
    path('admin/dashboard/',                    views.AdminDashboardView.as_view(),         name='admin-dashboard'),
    path('admin/reports/',                      views.AdminReportsView.as_view(),           name='admin-reports'),
    path('admin/settings/',                     views.AdminSettingsView.as_view(),          name='admin-settings'),
    path('admin/categories/',                   views.AdminCategoryListView.as_view(),      name='admin-categories'),
    path('admin/categories/<uuid:pk>/',         views.AdminCategoryDetailView.as_view(),    name='admin-category-detail'),
    path('admin/medicines/',                    views.AdminMedicineListView.as_view(),      name='admin-medicines'),
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
]
