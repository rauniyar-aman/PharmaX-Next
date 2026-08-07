from django.db import migrations


def grandfather_existing_admins(apps, schema_editor):
    User = apps.get_model('api', 'User')
    User.objects.filter(role='ADMIN').update(is_super_admin=True)


def unset_super_admin(apps, schema_editor):
    # Not reversible in a meaningful way — leave grandfathered admins as super admins on reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0014_seed_permissions'),
    ]

    operations = [
        migrations.RunPython(grandfather_existing_admins, unset_super_admin),
    ]
