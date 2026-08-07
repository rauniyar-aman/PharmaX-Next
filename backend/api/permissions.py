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
