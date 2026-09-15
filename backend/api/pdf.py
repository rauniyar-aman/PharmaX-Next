"""Prescription PDF generation.

Renders a completed consultation's Prescription into a single-page A4 document using reportlab
Platypus (pure-Python, installs on Render with no system libraries). The layout is a text-only
letterhead — a brand-green header bar with the store wordmark, the doctor/patient block, the
consultation notes, and tables for any suggested medicines and lab tests — so it needs no logo
asset. Everything is read from the Prescription and its related objects, keeping this callable
from anywhere the record exists (today: DoctorAppointmentCompleteView, right after creation).
"""
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from .utils import get_store_name

# Matches the brand green used across the emails (utils.BRAND_COLOR) so the PDF reads as the
# same product, not a bolt-on document.
BRAND = colors.HexColor('#006B2C')
INK = colors.HexColor('#1a1c1a')
MUTED = colors.HexColor('#5c6159')
HAIRLINE = colors.HexColor('#d9ded6')

_H = 'Helvetica'
_HB = 'Helvetica-Bold'


def _p(text, size=10, font=_H, color=INK, align=TA_LEFT, leading=None, space_after=0):
    style = ParagraphStyle(
        'p', fontName=font, fontSize=size, textColor=color, alignment=align,
        leading=leading or (size + 3), spaceAfter=space_after,
    )
    return Paragraph(text, style)


def _medicine_detail(medicine):
    """Sub-line under a medicine name — dosage and pack size when the catalog records them."""
    bits = [b for b in (medicine.dosage, medicine.package_size) if b]
    return ' · '.join(bits)


def build_prescription_pdf(prescription):
    """Return the prescription rendered as PDF bytes.

    Reads the doctor from the linked appointment (falling back to the stored doctor-name string
    if there's somehow no appointment), the patient from prescription.user, and the suggested
    items from the prescription's own medicine_items / lab_test_items relations.
    """
    store_name = get_store_name()
    appt = prescription.appointment
    doctor = appt.doctor if appt else None

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title=f'{store_name} Prescription', author=store_name,
    )
    content_width = doc.width
    flow = []

    # Header bar: wordmark left, "Prescription" right, on brand green. (No ℞ glyph — the built-in
    # Helvetica font has no U+211E, so it would render as a tofu box; the word alone is unambiguous.)
    header = Table(
        [[_p(escape(store_name), size=17, font=_HB, color=colors.white),
          _p('Prescription', size=13, font=_HB, color=colors.white, align=TA_RIGHT)]],
        colWidths=[content_width * 0.6, content_width * 0.4],
    )
    header.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 14),
        ('RIGHTPADDING', (-1, 0), (-1, 0), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    flow.append(header)
    flow.append(Spacer(1, 14))

    # ── Doctor + date, then patient ──────────────────────────────────────────────────
    if doctor:
        doctor_name = f'Dr. {doctor.name}'
        doctor_sub_bits = [doctor.specialty]
        if doctor.qualification:
            doctor_sub_bits.append(doctor.qualification)
        if doctor.license_number:
            doctor_sub_bits.append(f'License {doctor.license_number}')
        doctor_sub = ' · '.join([b for b in doctor_sub_bits if b])
    else:
        doctor_name = f'Dr. {prescription.doctor}' if prescription.doctor else 'Attending Doctor'
        doctor_sub = ''

    issued_date = (appt.scheduled_date if appt else timezone.localdate())
    date_label = issued_date.strftime('%b %d, %Y')

    doctor_cell = [_p(escape(doctor_name), size=12, font=_HB)]
    if doctor_sub:
        doctor_cell.append(_p(escape(doctor_sub), size=9, color=MUTED, space_after=0))
    date_cell = [
        _p('Date', size=8, color=MUTED, align=TA_RIGHT),
        _p(escape(date_label), size=10, font=_HB, align=TA_RIGHT),
    ]
    meta = Table([[doctor_cell, date_cell]], colWidths=[content_width * 0.65, content_width * 0.35])
    meta.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    flow.append(meta)
    flow.append(Spacer(1, 8))

    patient = prescription.user
    contact = ' · '.join([b for b in (patient.email, patient.phone) if b])
    flow.append(_p('Patient', size=8, color=MUTED))
    flow.append(_p(escape(patient.full_name), size=11, font=_HB))
    if contact:
        flow.append(_p(escape(contact), size=9, color=MUTED))
    flow.append(Spacer(1, 10))
    flow.append(HRFlowable(width='100%', thickness=1, color=HAIRLINE, spaceBefore=0, spaceAfter=12))

    # ── Notes ──────────────────────────────────────────────────────────────────────
    flow.append(_p('Notes', size=11, font=_HB, color=BRAND, space_after=4))
    notes_text = (prescription.notes or '').strip() or 'No additional notes recorded.'
    flow.append(_p(escape(notes_text).replace('\n', '<br/>'), size=10, leading=15))
    flow.append(Spacer(1, 14))

    # ── Medicines table ──────────────────────────────────────────────────────────────
    medicine_items = list(prescription.medicine_items.select_related('medicine').all())
    if medicine_items:
        flow.append(_p('Medicines', size=11, font=_HB, color=BRAND, space_after=4))
        rows = [[_p('Medicine', size=8, font=_HB, color=MUTED),
                 _p('Qty', size=8, font=_HB, color=MUTED, align=TA_RIGHT)]]
        for item in medicine_items:
            cell = [_p(escape(item.medicine.name), size=10, font=_HB)]
            detail = _medicine_detail(item.medicine)
            if detail:
                cell.append(_p(escape(detail), size=8, color=MUTED))
            rows.append([cell, _p(str(item.quantity), size=10, align=TA_RIGHT)])
        table = Table(rows, colWidths=[content_width * 0.82, content_width * 0.18])
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW', (0, 0), (-1, 0), 0.75, HAIRLINE),
            ('LINEBELOW', (0, 1), (-1, -2), 0.5, HAIRLINE),
        ]))
        flow.append(table)
        flow.append(Spacer(1, 14))

    # ── Recommended lab tests ────────────────────────────────────────────────────────
    lab_items = list(prescription.lab_test_items.select_related('lab_test').all())
    if lab_items:
        flow.append(_p('Recommended lab tests', size=11, font=_HB, color=BRAND, space_after=4))
        for item in lab_items:
            flow.append(_p(f'•&nbsp;&nbsp;{escape(item.lab_test.name)}', size=10, leading=16))
        flow.append(Spacer(1, 14))

    # ── Follow-up ──────────────────────────────────────────────────────────────────
    if appt and appt.follow_up_date:
        fu = appt.follow_up_date.strftime('%b %d, %Y')
        fu_text = f'Follow-up: {fu}'
        if appt.follow_up_notes:
            fu_text += f' — {appt.follow_up_notes}'
        flow.append(_p(escape(fu_text), size=10, font=_HB, color=INK))
        flow.append(Spacer(1, 14))

    # ── Footer ───────────────────────────────────────────────────────────────────────
    flow.append(HRFlowable(width='100%', thickness=1, color=HAIRLINE, spaceBefore=6, spaceAfter=8))
    issued_at = timezone.now().strftime('%b %d, %Y %H:%M UTC')
    flow.append(_p(f'Digitally issued via {escape(store_name)} · {issued_at}', size=8, color=MUTED))
    flow.append(_p('This document is a record of an online consultation and is not a substitute for a signed physical prescription.',
                   size=8, color=MUTED, leading=11))

    doc.build(flow)
    pdf_bytes = buf.getvalue()
    buf.close()
    return pdf_bytes
