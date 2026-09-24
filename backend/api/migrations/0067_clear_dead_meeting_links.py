"""Retire the dead meet.jit.si rooms.

Every confirmed appointment is carrying a `https://meet.jit.si/Swasthaya-<uuid>` link. That host
stopped allowing anonymous room creation in August 2023, so both the doctor and the patient land
on a "waiting for a moderator" screen and the consultation never starts.

Clear those links on appointments that could still be attended, so the serializer mints a working
JaaS room the next time either party opens the appointment. Only links matching the meet.jit.si
shape are touched: a doctor who pasted in their own Zoom or Meet room keeps it.
"""

from django.db import migrations
from django.utils import timezone


DEAD_HOSTS = ('https://meet.jit.si/', 'http://meet.jit.si/')


def clear_dead_meeting_links(apps, schema_editor):
    DoctorAppointment = apps.get_model('api', 'DoctorAppointment')
    today = timezone.localdate()
    qs = DoctorAppointment.objects.filter(status='CONFIRMED', scheduled_date__gte=today)
    ids = [a.id for a in qs.only('id', 'meeting_link')
           if a.meeting_link and a.meeting_link.startswith(DEAD_HOSTS)]
    if ids:
        DoctorAppointment.objects.filter(id__in=ids).update(meeting_link=None)


def noop(apps, schema_editor):
    # Nothing to restore: the old links did not work, and the new ones are re-mintable at will.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0066_lab_report_share'),
    ]

    operations = [
        migrations.RunPython(clear_dead_meeting_links, noop),
    ]
