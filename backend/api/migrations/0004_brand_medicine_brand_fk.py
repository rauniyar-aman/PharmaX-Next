import uuid
import django.db.models.deletion
from django.db import migrations, models


def migrate_brand_data(apps, schema_editor):
    Medicine = apps.get_model('api', 'Medicine')
    Brand = apps.get_model('api', 'Brand')
    seen = {}
    for medicine in Medicine.objects.all():
        name = (medicine.brand or '').strip() or 'Unknown'
        brand = seen.get(name)
        if not brand:
            brand, _ = Brand.objects.get_or_create(name=name)
            seen[name] = brand
        medicine.brand_new_id = brand.id
        medicine.save(update_fields=['brand_new'])


def reverse_migrate_brand_data(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_order_esewa_transaction_uuid_order_khalti_pidx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Brand',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100, unique=True)),
                ('logo_url', models.CharField(blank=True, max_length=500, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'brands',
            },
        ),
        migrations.AddField(
            model_name='medicine',
            name='brand_new',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='medicines', to='api.brand',
            ),
        ),
        migrations.RunPython(migrate_brand_data, reverse_migrate_brand_data),
        migrations.RemoveField(
            model_name='medicine',
            name='brand',
        ),
        migrations.RenameField(
            model_name='medicine',
            old_name='brand_new',
            new_name='brand',
        ),
        migrations.AlterField(
            model_name='medicine',
            name='brand',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='medicines', to='api.brand',
            ),
        ),
    ]
