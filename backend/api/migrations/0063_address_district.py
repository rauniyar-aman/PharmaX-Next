from django.db import migrations, models


def backfill_district(apps, schema_editor):
    """Best-effort: infer `district` from the free-text `city` for existing valley addresses so
    they keep working once the service-area gate goes live. Anything we can't confidently map
    stays blank, and the customer is prompted to set it (and drop a map pin) at checkout."""
    Address = apps.get_model('api', 'Address')
    rules = [
        ('Kathmandu', ('kathmandu', 'ktm', 'kirtipur', 'budhanilkantha', 'tokha', 'chandragiri',
                       'nagarjun', 'tarakeshwor', 'gokarneshwor', 'kageshwori', 'dakshinkali',
                       'shankharapur')),
        ('Lalitpur', ('lalitpur', 'patan', 'mahalaxmi', 'godawari', 'godamchaur')),
        ('Bhaktapur', ('bhaktapur', 'madhyapur', 'thimi', 'changunarayan', 'suryabinayak')),
    ]
    for addr in Address.objects.filter(district='').exclude(city='').only('id', 'city', 'district'):
        city = (addr.city or '').strip().lower()
        for district, needles in rules:
            if any(n in city for n in needles):
                addr.district = district
                addr.save(update_fields=['district'])
                break


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0062_labtestbooking_patient_age_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='address',
            name='district',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.RunPython(backfill_district, migrations.RunPython.noop),
    ]
