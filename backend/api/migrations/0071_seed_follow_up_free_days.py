from django.db import migrations


def seed_setting(apps, schema_editor):
    # Seeded rather than left to _get_setting()'s default so the window shows up as an editable
    # row on the admin settings page — an invisible default can't be tuned without a shell.
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.get_or_create(key='follow_up_free_days', defaults={'value': '7'})


def remove_setting(apps, schema_editor):
    SystemSetting = apps.get_model('api', 'SystemSetting')
    SystemSetting.objects.filter(key='follow_up_free_days').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0070_free_follow_up'),
    ]

    operations = [
        migrations.RunPython(seed_setting, remove_setting),
    ]
