from django.db import migrations


def seed_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.update_or_create(key='lab_collector_payout_flat', defaults={'value': '30'})


def remove_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.filter(key='lab_collector_payout_flat').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_labtestbooking_collector_broadcast_at_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_setting, remove_setting),
    ]
