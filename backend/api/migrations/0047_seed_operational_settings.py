from django.db import migrations

DEFAULTS = {
    'broadcast_radius_km': '3',
    'broadcast_window_minutes': '10',
    'priority_window_seconds': '30',
    'document_max_size_mb': '5',
    'eta_assumed_speed_kmh': '20',
}


def seed_settings(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    for key, value in DEFAULTS.items():
        SystemSetting.objects.update_or_create(key=key, defaults={'value': value})


def remove_settings(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.filter(key__in=DEFAULTS.keys()).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_labtestbooking_esewa_transaction_uuid'),
    ]

    operations = [
        migrations.RunPython(seed_settings, remove_settings),
    ]
