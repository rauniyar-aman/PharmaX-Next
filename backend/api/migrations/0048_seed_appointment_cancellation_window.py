from django.db import migrations


def seed_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.update_or_create(key='appointment_cancellation_window_hours', defaults={'value': '1'})


def remove_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.filter(key='appointment_cancellation_window_hours').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_seed_operational_settings'),
    ]

    operations = [
        migrations.RunPython(seed_setting, remove_setting),
    ]
