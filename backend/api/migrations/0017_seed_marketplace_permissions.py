from django.db import migrations

PERMISSIONS = [
    ('manage_pharmacies', 'Manage Pharmacies', 'Marketplace'),
    ('manage_delivery_agents', 'Manage Delivery Agents', 'Marketplace'),
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
        ('api', '0016_alter_order_status_alter_user_role_deliveryagent_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_permissions, remove_permissions),
    ]
