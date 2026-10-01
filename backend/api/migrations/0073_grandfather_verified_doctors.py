from django.db import migrations


def grandfather_existing_doctors(apps, schema_editor):
    """Item 5d adds a hard gate: an unverified doctor is no longer listed, bookable, or able to
    accept consultations. Every doctor already on the platform predates that gate and was created
    with is_verified=False (the model default) — so without this backfill they would all vanish
    from the site the moment the gate ships. Anyone currently active was implicitly trusted, so
    treat them as verified. Only doctors created from here on must be verified by an admin.
    """
    Doctor = apps.get_model('api', 'Doctor')
    Doctor.objects.filter(is_active=True, is_verified=False).update(is_verified=True)


def noop_reverse(apps, schema_editor):
    # Irreversible by design: we can't tell which rows this set, and flipping active doctors back to
    # unverified would hide the whole roster. Leave them verified on rollback.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0072_doctordateavailability'),
    ]

    operations = [
        migrations.RunPython(grandfather_existing_doctors, noop_reverse),
    ]
