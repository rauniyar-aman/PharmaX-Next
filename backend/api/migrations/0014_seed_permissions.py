from django.db import migrations

PERMISSIONS = [
    ('manage_orders', 'Manage Orders', 'Orders'),
    ('manage_prescriptions', 'Manage Prescriptions', 'Orders'),
    ('manage_inventory', 'Manage Inventory', 'Catalog'),
    ('manage_lab_tests', 'Manage Lab Tests', 'Services'),
    ('manage_doctors', 'Manage Doctor Consult', 'Services'),
    ('manage_blog', 'Manage Health Articles', 'Content'),
    ('manage_marketing', 'Manage Coupons & Marketing', 'Marketing'),
    ('manage_subscriptions', 'Manage Subscriptions', 'Services'),
    ('manage_plus_membership', 'Manage Plus Membership', 'Marketing'),
    ('manage_finance', 'Manage Wallet & Finance', 'Finance'),
    ('manage_customers', 'Manage Customers', 'Customers'),
    ('view_reports', 'View Reports & Dashboard', 'Reports'),
]


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model('api', 'Permission')
    for code, label, group in PERMISSIONS:
        Permission.objects.update_or_create(code=code, defaults={'label': label, 'group': group})


def remove_permissions(apps, schema_editor):
    Permission = apps.get_model('api', 'Permission')
    Permission.objects.filter(code__in=[code for code, _, _ in PERMISSIONS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_add_permission_model'),
    ]

    operations = [
        migrations.RunPython(seed_permissions, remove_permissions),
    ]
