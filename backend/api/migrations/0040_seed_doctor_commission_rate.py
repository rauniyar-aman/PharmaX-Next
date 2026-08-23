from django.db import migrations


def seed_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.update_or_create(key='doctor_commission_rate', defaults={'value': '15'})


def remove_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.filter(key='doctor_commission_rate').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0039_doctor_is_verified_doctor_license_number_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_setting, remove_setting),
    ]
