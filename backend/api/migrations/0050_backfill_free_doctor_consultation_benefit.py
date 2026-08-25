from django.db import migrations


def backfill_benefit(apps, schema_editor):
    """Every existing PlusPlan implicitly granted free doctor consultations under the old
    behavior (ANY active Plus membership waived the fee, regardless of plan) — see
    _user_has_plus_benefit() in views.py, which now checks this key specifically instead of just
    "is there an active membership." Without this backfill, every current Plus subscriber would
    silently lose a benefit they had yesterday the moment this ships. New plans created after this
    migration are unaffected — they simply start with no benefits until admin adds some."""
    PlusPlan = apps.get_model('api', 'PlusPlan')
    PlusBenefit = apps.get_model('api', 'PlusBenefit')
    for plan in PlusPlan.objects.all():
        PlusBenefit.objects.get_or_create(
            plan=plan, key='FREE_DOCTOR_CONSULTATION',
            defaults={'description': 'Free doctor consultations', 'is_active': True},
        )


def remove_backfilled_benefit(apps, schema_editor):
    PlusBenefit = apps.get_model('api', 'PlusBenefit')
    PlusBenefit.objects.filter(key='FREE_DOCTOR_CONSULTATION').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0049_promobanner_featureddeal_plusbenefit'),
    ]

    operations = [
        migrations.RunPython(backfill_benefit, remove_backfilled_benefit),
    ]
