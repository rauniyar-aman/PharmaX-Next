from django.db import migrations


def backfill_no_pharmacy_found(apps, schema_editor):
    """Orders that were already stuck in AWAITING_PAYMENT with zero accepted items (the bug this
    migration's sibling fixes going forward) get moved to the new NO_PHARMACY_FOUND status, so
    they're consistently hidden from the customer's order history rather than only new orders
    being handled correctly."""
    Order = apps.get_model('api', 'Order')
    Order.objects.filter(status='AWAITING_PAYMENT', fulfillments__isnull=True).update(status='NO_PHARMACY_FOUND')


def reverse(apps, schema_editor):
    Order = apps.get_model('api', 'Order')
    Order.objects.filter(status='NO_PHARMACY_FOUND').update(status='AWAITING_PAYMENT')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0025_order_no_pharmacy_found_status'),
    ]

    operations = [
        migrations.RunPython(backfill_no_pharmacy_found, reverse),
    ]
