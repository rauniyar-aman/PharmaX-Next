from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Any admin — used only for views truly open to all admins (e.g. viewing own profile)."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'ADMIN')


class IsSuperAdmin(BasePermission):
    """Settings and admin-management endpoints — never delegable."""
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role == 'ADMIN' and u.is_super_admin)


class IsPharmacy(BasePermission):
    """Pharmacy-dashboard endpoints. Role-only — every view still has to scope its queries to
    request.user.pharmacy itself (via the OneToOneField on Pharmacy.user); this class doesn't
    (and can't generically) enforce per-object ownership."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'PHARMACY')


class IsDeliveryAgent(BasePermission):
    """Delivery-dashboard endpoints. Same shape as IsPharmacy — role-only. Every view still has
    to scope to request.user.delivery_agent itself (via the OneToOneField on
    DeliveryAgent.user)."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'DELIVERY_AGENT')


def require_permission(code: str):
    """Factory: returns a permission class checking for a specific granted permission code.
    Super admins pass automatically regardless of code."""
    class _HasPermission(BasePermission):
        def has_permission(self, request, view):
            u = request.user
            if not (u and u.is_authenticated and u.role == 'ADMIN'):
                return False
            if u.is_super_admin:
                return True
            return u.permissions.filter(code=code).exists()
    return _HasPermission
