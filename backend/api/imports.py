"""Bulk spreadsheet import/export for the admin catalog (medicines, brands, categories, lab tests).

One spec table (`ENTITY_SPECS`) drives four operations for every entity, so the column list,
types, required-ness, and foreign-key handling live in exactly one place:

  * template  — an .xlsx with the header row, an example row, and an instructions sheet.
  * export    — every existing record as an .xlsx in the same column layout (so an admin can
                export, edit in Excel, and re-import to bulk-edit).
  * preview   — parse an uploaded file and return a *plan* without writing anything: which rows
                are new, which match an existing record (with an old-vs-new diff), which reference
                a category/brand that doesn't exist yet, and which rows are invalid + why.
  * commit    — re-parse the same file and apply only the rows/decisions the admin confirmed.

The two-phase preview→commit flow is deliberately stateless: the client re-sends the same file on
commit along with the row numbers to apply and the refs to create. Row numbers are stable across
the two parses of one file, so nothing has to be stashed server-side between the calls.
"""
import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from django.db import transaction

from .models import Brand, Category, LabTest, LabTestCategory, Medicine

# Cell text that reads as a boolean. Export writes "Yes"/"No", so those must round-trip.
_TRUE = {'true', '1', 'yes', 'y', 't', 'in stock', 'active'}
_FALSE = {'false', '0', 'no', 'n', 'f', 'out of stock', 'inactive'}


def _col(key, header, kind='str', required=False, default=None, choices=None, ref=None, field=None):
    return {
        'key': key, 'header': header, 'kind': kind, 'required': required,
        'default': default, 'choices': choices, 'ref': ref, 'field': field or key,
    }


# type/choice normalisers accept a few friendly spellings but store the model's canonical code.
_MED_TYPE = {'RX': 'Rx', 'PRESCRIPTION': 'Rx', 'OTC': 'OTC', 'OVER THE COUNTER': 'OTC'}
_SAMPLE = {'BLOOD': 'BLOOD', 'URINE': 'URINE', 'SWAB': 'SWAB', 'OTHER': 'OTHER'}

ENTITY_SPECS = {
    'categories': {
        'model': Category,
        'permission': 'manage_inventory',
        'label': 'Categories',
        'noun': 'category',
        'match': ['name'],
        'refs': {},
        'columns': [
            _col('name', 'Name', required=True),
            _col('icon', 'Icon'),
            _col('description', 'Description', kind='text'),
            _col('is_active', 'Active', kind='bool', default=True),
        ],
        'example': {'name': 'Pain Relief', 'icon': 'medication', 'description': 'Analgesics and fever reducers', 'is_active': 'Yes'},
    },
    'brands': {
        'model': Brand,
        'permission': 'manage_inventory',
        'label': 'Brands',
        'noun': 'brand',
        'match': ['name'],
        'refs': {},
        'columns': [
            _col('name', 'Name', required=True),
            _col('manufacturer', 'Manufacturer'),
            _col('logo_url', 'Logo URL'),
            _col('description', 'Description', kind='text'),
            _col('is_active', 'Active', kind='bool', default=True),
        ],
        'example': {'name': 'Acme Pharma', 'manufacturer': 'Acme Pharmaceuticals Pvt. Ltd.', 'logo_url': '', 'description': '', 'is_active': 'Yes'},
    },
    'medicines': {
        'model': Medicine,
        'permission': 'manage_inventory',
        'label': 'Medicines',
        'noun': 'medicine',
        'match': ['name', 'brand'],
        'refs': {'brands': Brand, 'categories': Category},
        'columns': [
            _col('name', 'Name', required=True),
            _col('brand', 'Brand', kind='ref', ref='brands', field='brand', required=True),
            _col('category', 'Category', kind='ref', ref='categories', field='category', required=True),
            _col('type', 'Type', kind='choice', choices=_MED_TYPE, required=True),
            _col('price', 'Price (NPR)', kind='decimal', required=True),
            _col('original_price', 'Original Price (NPR)', kind='decimal', required=True),
            _col('stock_quantity', 'Stock Quantity', kind='int', default=0),
            _col('in_stock', 'In Stock', kind='bool', default=True),
            _col('dosage', 'Dosage'),
            _col('package_size', 'Package Size'),
            _col('manufacturer', 'Manufacturer'),
            _col('description', 'Description', kind='text'),
            _col('usage', 'Usage', kind='text'),
            _col('side_effects', 'Side Effects', kind='text'),
            _col('image_url', 'Image URL'),
            _col('expiry_date', 'Expiry Date', kind='date'),
            _col('promo_badge', 'Promo Badge'),
        ],
        'example': {
            'name': 'Paracetamol 500mg', 'brand': 'Acme Pharma', 'category': 'Pain Relief',
            'type': 'OTC', 'price': '25', 'original_price': '30', 'stock_quantity': '200',
            'in_stock': 'Yes', 'dosage': '500mg', 'package_size': 'Strip of 10',
            'manufacturer': 'Acme Pharmaceuticals', 'description': 'For mild pain and fever',
            'usage': '1 tablet every 6 hours', 'side_effects': 'Rare when used as directed',
            'image_url': '', 'expiry_date': '2027-12-31', 'promo_badge': 'Best Seller',
        },
    },
    'lab-tests': {
        'model': LabTest,
        'permission': 'manage_lab_tests',
        'label': 'Lab Tests',
        'noun': 'lab test',
        'match': ['name'],
        'refs': {'categories': LabTestCategory},
        'columns': [
            _col('name', 'Name', required=True),
            _col('category', 'Category', kind='ref', ref='categories', field='category', required=True),
            _col('price', 'Price (NPR)', kind='decimal', required=True),
            _col('original_price', 'Original Price (NPR)', kind='decimal', required=True),
            _col('sample_type', 'Sample Type', kind='choice', choices=_SAMPLE, default='BLOOD'),
            _col('fasting_required', 'Fasting Required', kind='bool', default=False),
            _col('is_package', 'Is Package', kind='bool', default=False),
            _col('is_active', 'Active', kind='bool', default=True),
            _col('reporting_time', 'Reporting Time'),
            _col('description', 'Description', kind='text'),
            _col('parameters_included', 'Parameters Included', kind='text'),
        ],
        'example': {
            'name': 'Complete Blood Count (CBC)', 'category': 'Hematology', 'price': '500',
            'original_price': '650', 'sample_type': 'BLOOD', 'fasting_required': 'No',
            'is_package': 'No', 'is_active': 'Yes', 'reporting_time': 'Same day',
            'description': 'Measures the cells that make up blood', 'parameters_included': 'RBC, WBC, Hemoglobin, Platelets',
        },
    },
}


def get_spec(entity):
    return ENTITY_SPECS.get(entity)


# --- value coercion ------------------------------------------------------------------------------

def _norm(s):
    """Header key: lower-cased, stripped of spaces/underscores, so 'Original Price', 'original_price'
    and 'originalprice' all match the same column."""
    return str(s if s is not None else '').strip().lower().replace(' ', '').replace('_', '')


def _is_blank(raw):
    return raw is None or (isinstance(raw, str) and raw.strip() == '')


def _parse_date(raw, col):
    if isinstance(raw, datetime):
        return raw.date(), None
    if isinstance(raw, date):
        return raw, None
    s = str(raw).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, fmt).date(), None
        except ValueError:
            continue
    return None, f"{col['header']}: use a date like 2027-12-31"


def _coerce(col, raw):
    """Return (value, error, present). `present` is False for a blank cell — a blank optional cell
    is left untouched on update and falls back to the model default on create."""
    kind = col['kind']
    if _is_blank(raw):
        return None, None, False
    if kind in ('str', 'text', 'ref'):
        return str(raw).strip(), None, True
    if kind == 'bool':
        s = str(raw).strip().lower()
        if s in _TRUE:
            return True, None, True
        if s in _FALSE:
            return False, None, True
        return None, f"{col['header']}: expected Yes or No", True
    if kind == 'int':
        try:
            return int(float(str(raw).strip())), None, True
        except (ValueError, TypeError):
            return None, f"{col['header']}: must be a whole number", True
    if kind == 'decimal':
        try:
            d = Decimal(str(raw).strip())
        except (InvalidOperation, ValueError, TypeError):
            return None, f"{col['header']}: must be a number", True
        if d < 0:
            return None, f"{col['header']}: must not be negative", True
        return d, None, True
    if kind == 'date':
        v, err = _parse_date(raw, col)
        return v, err, True
    if kind == 'choice':
        mapped = col['choices'].get(str(raw).strip().upper())
        if mapped is None:
            allowed = ', '.join(sorted(set(col['choices'].values())))
            return None, f"{col['header']}: must be one of {allowed}", True
        return mapped, None, True
    return str(raw).strip(), None, True


# --- reading the uploaded file -------------------------------------------------------------------

def _read_table(file, filename):
    """Return (headers, rows) where rows is a list of {header: raw_value}. Supports .xlsx and .csv."""
    name = (filename or '').lower()
    if name.endswith('.csv'):
        raw = file.read()
        text = raw.decode('utf-8-sig') if isinstance(raw, bytes) else raw
        reader = csv.reader(io.StringIO(text))
        all_rows = list(reader)
        if not all_rows:
            return [], []
        headers = [str(h).strip() for h in all_rows[0]]
        rows = [{headers[i]: r[i] for i in range(len(headers)) if i < len(r)} for r in all_rows[1:]]
        return headers, rows
    wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    header_row = next(rows_iter, None) or []
    headers = [str(h).strip() if h is not None else '' for h in header_row]
    rows = []
    for r in rows_iter:
        rows.append({headers[i]: (r[i] if i < len(r) else None) for i in range(len(headers))})
    wb.close()
    return headers, rows


def parse_file(spec, file, filename):
    """Parse the file into per-row records: {row, values, present, errors, refs}. Fully-blank rows
    are dropped (Excel commonly leaves trailing empties). Row numbers are 1-based including the
    header, so the first data row is row 2 — matching what the admin sees in the spreadsheet."""
    headers, rows = _read_table(file, filename)
    norm_to_header = {}
    for h in headers:
        norm_to_header.setdefault(_norm(h), h)

    # For each column, the actual sheet header that supplies it (matched by normalised key/header).
    col_header = {}
    for col in spec['columns']:
        for token in (_norm(col['key']), _norm(col['header'])):
            if token in norm_to_header:
                col_header[col['key']] = norm_to_header[token]
                break

    parsed = []
    for idx, row in enumerate(rows):
        if all(_is_blank(v) for v in row.values()):
            continue
        values, present, errors = {}, {}, []
        for col in spec['columns']:
            header = col_header.get(col['key'])
            raw = row.get(header) if header else None
            value, err, is_present = _coerce(col, raw)
            values[col['key']] = value
            present[col['key']] = is_present
            if err:
                errors.append(err)
            elif col['required'] and not is_present:
                errors.append(f"{col['header']} is required")
        parsed.append({'row': idx + 2, 'values': values, 'present': present, 'errors': errors})
    return parsed


# --- matching + planning -------------------------------------------------------------------------

def _match_key(spec, values):
    return tuple((values.get(k) or '').strip().lower() for k in spec['match'])


def _load_existing(spec, parsed):
    """Index existing records by their match key (case-insensitive), fetching only what the file
    references."""
    model = spec['model']
    names = {(p['values'].get('name') or '').strip() for p in parsed if p['values'].get('name')}
    if not names:
        return {}
    if 'brand' in spec['match']:
        qs = model.objects.select_related('brand').filter(name__in=names)
    else:
        qs = model.objects.filter(name__in=names)
    index = {}
    for obj in qs:
        vals = {'name': obj.name}
        if 'brand' in spec['match']:
            vals['brand'] = obj.brand.name
        index[_match_key(spec, vals)] = obj
    return index


def _load_refs(spec):
    """{ref_key: {name_lower: instance}} for every foreign-key target the entity uses."""
    out = {}
    for ref_key, ref_model in spec['refs'].items():
        out[ref_key] = {r.name.lower(): r for r in ref_model.objects.all()}
    return out


def _display(col, value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    return str(value)


def _existing_display(spec, col, obj):
    if col['kind'] == 'ref':
        rel = getattr(obj, col['field'], None)
        return rel.name if rel else ''
    return _display(col, getattr(obj, col['key'], None))


def build_plan(spec, parsed):
    """Turn parsed rows into the preview plan the client renders: creates / updates (with a
    field-level old-vs-new diff) / missing refs / errors."""
    existing = _load_existing(spec, parsed)
    refs = _load_refs(spec)
    ref_cols = [c for c in spec['columns'] if c['kind'] == 'ref']

    creates, updates, errors = [], [], []
    missing = {k: [] for k in spec['refs']}
    missing_seen = {k: set() for k in spec['refs']}

    for p in parsed:
        if p['errors']:
            errors.append({'row': p['row'], 'message': '; '.join(p['errors'])})
            continue
        values, present = p['values'], p['present']

        # Note any referenced category/brand that doesn't exist yet (deduped, preserving order).
        for col in ref_cols:
            name = values.get(col['key'])
            if name and name.lower() not in refs[col['ref']]:
                if name.lower() not in missing_seen[col['ref']]:
                    missing_seen[col['ref']].add(name.lower())
                    missing[col['ref']].append(name)

        label = values.get('name') or ''
        if 'brand' in spec['match'] and values.get('brand'):
            label = f"{label} ({values['brand']})"

        match = existing.get(_match_key(spec, values))
        if match is None:
            fields = [{'field': c['header'], 'value': _display(c, values[c['key']])}
                      for c in spec['columns'] if present[c['key']]]
            creates.append({'row': p['row'], 'label': label, 'fields': fields})
        else:
            changes = []
            for c in spec['columns']:
                if not present[c['key']]:
                    continue
                new_val = values[c['key']] if c['kind'] == 'ref' else _display(c, values[c['key']])
                old_val = _existing_display(spec, c, match)
                if str(old_val) != str(new_val):
                    changes.append({'field': c['header'], 'old': old_val, 'new': new_val})
            updates.append({'row': p['row'], 'label': label, 'existing_id': str(match.id), 'changes': changes})

    return {
        'label': spec['label'],
        'columns': [c['header'] for c in spec['columns']],
        'total_rows': len(parsed),
        'creates': creates,
        'updates': updates,
        'missing_refs': {k: v for k, v in missing.items() if v},
        'errors': errors,
    }


# --- committing ----------------------------------------------------------------------------------

def apply_import(spec, parsed, apply_rows, create_refs):
    """Apply the confirmed rows. `apply_rows` is the set of row numbers to write (creates the admin
    kept + updates they approved); `create_refs` is {ref_key: [names]} to create first. Returns a
    summary. Runs in a single transaction — a row that can't resolve a required ref is recorded as
    failed and skipped, it doesn't abort the others."""
    apply_rows = set(apply_rows)
    ref_cols = [c for c in spec['columns'] if c['kind'] == 'ref']
    created = updated = skipped = 0
    failed = []

    with transaction.atomic():
        refs = _load_refs(spec)
        # Create the refs the admin approved, then make them available to rows below.
        for ref_key, names in (create_refs or {}).items():
            ref_model = spec['refs'].get(ref_key)
            if not ref_model:
                continue
            for name in names:
                name = (name or '').strip()
                if not name:
                    continue
                inst, _ = ref_model.objects.get_or_create(name=name)
                refs[ref_key][name.lower()] = inst

        existing = _load_existing(spec, parsed)

        for p in parsed:
            if p['row'] not in apply_rows:
                skipped += 1
                continue
            if p['errors']:
                failed.append({'row': p['row'], 'message': '; '.join(p['errors'])})
                continue
            values, present = p['values'], p['present']

            # Resolve required refs against existing + just-created; bail this row if unresolved.
            resolved, ok = {}, True
            for col in ref_cols:
                name = values.get(col['key'])
                inst = refs[col['ref']].get(name.lower()) if name else None
                if col['required'] and inst is None:
                    failed.append({'row': p['row'], 'message': f"{col['header']} '{name}' does not exist"})
                    ok = False
                    break
                if inst is not None:
                    resolved[col['field']] = inst
            if not ok:
                continue

            match = existing.get(_match_key(spec, values))
            obj = match or spec['model']()
            for col in spec['columns']:
                if col['kind'] == 'ref':
                    if col['field'] in resolved:
                        setattr(obj, col['field'], resolved[col['field']])
                elif present[col['key']]:
                    setattr(obj, col['key'], values[col['key']])
            obj.save()
            if match:
                updated += 1
            else:
                created += 1

    return {'created': created, 'updated': updated, 'skipped': skipped, 'failed': failed}


# --- workbook generation (export + template) -----------------------------------------------------

def _autosize(ws, headers):
    for i, h in enumerate(headers, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(14, min(48, len(str(h)) + 6))


def _to_bytes(wb):
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_workbook(spec):
    """Every existing record, in the import column layout, so an export can be edited and re-imported."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = spec['label'][:31]
    headers = [c['header'] for c in spec['columns']]
    ws.append(headers)

    qs = spec['model'].objects.all()
    select = [c['field'] for c in spec['columns'] if c['kind'] == 'ref']
    if select:
        qs = qs.select_related(*select)
    qs = qs.order_by('name')
    for obj in qs:
        row = []
        for c in spec['columns']:
            if c['kind'] == 'ref':
                rel = getattr(obj, c['field'], None)
                row.append(rel.name if rel else '')
            else:
                row.append(_display(c, getattr(obj, c['key'], None)))
        ws.append(row)
    _autosize(ws, headers)
    return _to_bytes(wb)


def template_workbook(spec):
    """Header row + one filled example row, plus an Instructions sheet describing every column."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = spec['label'][:31]
    headers = [c['header'] for c in spec['columns']]
    ws.append(headers)
    ws.append([spec['example'].get(c['key'], '') for c in spec['columns']])
    _autosize(ws, headers)

    info = wb.create_sheet('Instructions')
    info.append(['Column', 'Required', 'Type / accepted values', 'Notes'])
    for c in spec['columns']:
        if c['kind'] == 'choice':
            typ = 'one of: ' + ', '.join(sorted(set(c['choices'].values())))
        elif c['kind'] == 'bool':
            typ = 'Yes or No'
        elif c['kind'] == 'decimal':
            typ = 'number (e.g. 25 or 25.50)'
        elif c['kind'] == 'int':
            typ = 'whole number'
        elif c['kind'] == 'date':
            typ = 'date (YYYY-MM-DD)'
        elif c['kind'] == 'ref':
            typ = f"{spec['noun']} {c['header'].lower()} name"
        else:
            typ = 'text'
        note = ''
        if c['kind'] == 'ref':
            note = 'Matched by name; you can create missing ones during import.'
        elif c['default'] is not None:
            note = f"Defaults to {_display(c, c['default'])} if left blank."
        info.append([c['header'], 'Yes' if c['required'] else 'No', typ, note])
    _autosize(info, ['Column', 'Required', 'Type / accepted values', 'Notes'])

    match_note = ' + '.join(spec['match'])
    info.append([])
    info.append([f"Rows are matched to existing records by: {match_note}. Matches can be reviewed and updated on import."])
    return _to_bytes(wb)
