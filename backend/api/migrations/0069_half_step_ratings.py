# Widens the four user-submitted rating columns from integer to Decimal(2,1) so customers can
# award half stars (3.5 / 4.5 …). Existing integer ratings cast losslessly to 4.0, 5.0 and so on,
# so no data migration is needed. The two denormalized averages (Medicine.rating, Doctor.rating)
# were already Decimal(3,2) and are untouched.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0068_doctorappointment_esewa_transaction_uuid'),
    ]

    operations = [
        migrations.AlterField(
            model_name='doctorreview',
            name='rating',
            field=models.DecimalField(decimal_places=1, max_digits=2),
        ),
        migrations.AlterField(
            model_name='order',
            name='order_rating',
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=2, null=True),
        ),
        migrations.AlterField(
            model_name='orderfulfillment',
            name='rider_rating',
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=2, null=True),
        ),
        migrations.AlterField(
            model_name='review',
            name='rating',
            field=models.DecimalField(decimal_places=1, max_digits=2),
        ),
    ]
