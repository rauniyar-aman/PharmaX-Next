'use client'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

// Bulk .xlsx/.csv import + export for an admin catalog entity. Import is a two-step, confirm-first
// flow: the file is previewed server-side (nothing is written), the admin reviews what's new, what
// changed (old vs new), which categories/brands are missing, and which rows are invalid — then
// picks exactly what to apply. Export and a filled template download live alongside. Reused by the
// medicines, brands, categories and lab-tests list pages via the `entity` prop.

type Entity = 'categories' | 'brands' | 'medicines' | 'lab-tests'

interface Props {
  entity: Entity
  title: string          // human label, e.g. "Medicines"
  onImported?: () => void // refresh the list after a successful import
}

interface PlanField { field: string; value: string }
interface Change { field: string; old: string; new: string }
interface CreateRow { row: number; label: string; fields: PlanField[] }
interface UpdateRow { row: number; label: string; existing_id: string; changes: Change[] }
interface Plan {
  label: string
  total_rows: number
  creates: CreateRow[]
  updates: UpdateRow[]
  missing_refs: Record<string, string[]>
  errors: { row: number; message: string }[]
}
interface Summary { created: number; updated: number; skipped: number; failed: { row: number; message: string }[] }

const REF_LABELS: Record<string, string> = { categories: 'categories', brands: 'brands' }

async function downloadXlsx(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export default function BulkDataTools({ entity, title, onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)          // export/template download in flight
  const fileRef = useRef<HTMLInputElement>(null)

  // dialog state
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)    // preview/commit in flight
  const [plan, setPlan] = useState<Plan | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [applyCreate, setApplyCreate] = useState<Record<number, boolean>>({})
  const [applyUpdate, setApplyUpdate] = useState<Record<number, boolean>>({})
  const [createRefs, setCreateRefs] = useState<Record<string, Record<string, boolean>>>({})

  const reset = () => {
    setFile(null); setPlan(null); setSummary(null)
    setApplyCreate({}); setApplyUpdate({}); setCreateRefs({})
    if (fileRef.current) fileRef.current.value = ''
  }
  const closeDialog = () => { setOpen(false); reset() }

  const handleExport = async () => {
    setBusy(true)
    try { await downloadXlsx(`/admin/${entity}/export/`, `${entity}-export.xlsx`) }
    catch { toast.error('Export failed.') }
    finally { setBusy(false) }
  }

  const handleTemplate = async () => {
    setBusy(true)
    try { await downloadXlsx(`/admin/${entity}/import/template/`, `${entity}-import-template.xlsx`) }
    catch { toast.error('Could not download template.') }
    finally { setBusy(false) }
  }

  const runPreview = async (f: File) => {
    setFile(f); setLoading(true); setPlan(null); setSummary(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await api.post(`/admin/${entity}/import/preview/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const p: Plan = res.data.data
      setPlan(p)
      // Defaults: create new rows (checked), leave existing records untouched unless opted in,
      // offer to create the missing refs (checked — the admin still sees and can untick each).
      setApplyCreate(Object.fromEntries(p.creates.map((c) => [c.row, true])))
      setApplyUpdate(Object.fromEntries(p.updates.map((u) => [u.row, false])))
      setCreateRefs(Object.fromEntries(
        Object.entries(p.missing_refs).map(([k, names]) => [k, Object.fromEntries(names.map((n) => [n, true]))])
      ))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not read that file.')
      reset()
    } finally {
      setLoading(false)
    }
  }

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) runPreview(f)
  }

  const applyRows = plan
    ? [...plan.creates.filter((c) => applyCreate[c.row]).map((c) => c.row),
       ...plan.updates.filter((u) => applyUpdate[u.row]).map((u) => u.row)]
    : []

  const selectedRefs = () => {
    const out: Record<string, string[]> = {}
    for (const [k, names] of Object.entries(createRefs)) {
      const chosen = Object.entries(names).filter(([, v]) => v).map(([n]) => n)
      if (chosen.length) out[k] = chosen
    }
    return out
  }

  const handleCommit = async () => {
    if (!file || applyRows.length === 0) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('apply_rows', JSON.stringify(applyRows))
      fd.append('create_refs', JSON.stringify(selectedRefs()))
      const res = await api.post(`/admin/${entity}/import/commit/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSummary(res.data.data)
      onImported?.()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  const btn = 'flex items-center gap-1.5 px-3 py-2.5 border border-outline-variant text-on-surface text-sm font-semibold rounded-xl hover:bg-surface-container-low transition-colors disabled:opacity-60 whitespace-nowrap'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>Import
      </button>
      <button type="button" onClick={handleExport} disabled={busy} className={btn}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>Export
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="bg-surface rounded-2xl border border-outline-variant w-full max-w-2xl max-h-full flex flex-col">
            {/* header */}
            <div className="flex items-center justify-between p-5 border-b border-outline-variant">
              <div>
                <p className="text-sm font-bold text-on-surface">Import {title}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Upload a .xlsx or .csv, review the changes, then apply.</p>
              </div>
              <button onClick={closeDialog} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Step 1: pick a file */}
              {!plan && !summary && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-dashed border-outline-variant p-6 text-center">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '32px' }}>table_view</span>
                    <p className="text-sm text-on-surface mt-2">Choose a spreadsheet to import</p>
                    <p className="text-xs text-on-surface-variant mt-1">Columns must match the template.</p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={loading}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                        {loading
                          ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Reading…</>
                          : <><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>folder_open</span>Choose file</>}
                      </button>
                      <button type="button" onClick={handleTemplate} disabled={busy} className={btn}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>description</span>Template
                      </button>
                    </div>
                    <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={onPickFile} />
                  </div>
                </div>
              )}

              {/* Step 2: review the plan */}
              {plan && !summary && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span>
                    {file?.name} — {plan.total_rows} data rows
                  </div>

                  {plan.errors.length > 0 && (
                    <Section tone="error" icon="error" title={`${plan.errors.length} row${plan.errors.length > 1 ? 's' : ''} with problems (will be skipped)`}>
                      <ul className="space-y-1">
                        {plan.errors.map((e) => (
                          <li key={e.row} className="text-xs text-on-surface"><span className="font-semibold">Row {e.row}:</span> {e.message}</li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {Object.keys(plan.missing_refs).length > 0 && (
                    <Section tone="warn" icon="add_circle" title="New categories / brands referenced">
                      <p className="text-xs text-on-surface-variant mb-2">These don&apos;t exist yet. Tick the ones to create — rows using an unticked name will be skipped.</p>
                      {Object.entries(plan.missing_refs).map(([k, names]) => (
                        <div key={k} className="mb-2">
                          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">New {REF_LABELS[k] || k}</p>
                          <div className="flex flex-wrap gap-2">
                            {names.map((n) => (
                              <label key={n} className="flex items-center gap-1.5 text-xs bg-surface border border-outline-variant rounded-lg px-2 py-1 cursor-pointer">
                                <input type="checkbox" checked={!!createRefs[k]?.[n]}
                                  onChange={(e) => setCreateRefs((p) => ({ ...p, [k]: { ...p[k], [n]: e.target.checked } }))} />
                                {n}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Section>
                  )}

                  {plan.creates.length > 0 && (
                    <Section tone="ok" icon="add" title={`${plan.creates.length} new ${plan.label.toLowerCase()}`}
                      action={<SelectToggle rows={plan.creates.map((c) => c.row)} state={applyCreate} setState={setApplyCreate} />}>
                      <ul className="space-y-1.5">
                        {plan.creates.map((c) => (
                          <li key={c.row} className="flex items-start gap-2">
                            <input type="checkbox" className="mt-0.5" checked={!!applyCreate[c.row]}
                              onChange={(e) => setApplyCreate((p) => ({ ...p, [c.row]: e.target.checked }))} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-on-surface">{c.label}</p>
                              <p className="text-[11px] text-on-surface-variant truncate">
                                {c.fields.filter((f) => f.value).slice(0, 4).map((f) => `${f.field}: ${f.value}`).join(' · ')}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {plan.updates.length > 0 && (
                    <Section tone="info" icon="edit" title={`${plan.updates.length} existing match${plan.updates.length > 1 ? 'es' : ''}`}
                      action={<SelectToggle rows={plan.updates.filter((u) => u.changes.length).map((u) => u.row)} state={applyUpdate} setState={setApplyUpdate} />}>
                      <p className="text-xs text-on-surface-variant mb-2">Existing records are kept as-is unless you tick them to update.</p>
                      <ul className="space-y-2">
                        {plan.updates.map((u) => (
                          <li key={u.row} className="flex items-start gap-2">
                            <input type="checkbox" className="mt-0.5" checked={!!applyUpdate[u.row]} disabled={u.changes.length === 0}
                              onChange={(e) => setApplyUpdate((p) => ({ ...p, [u.row]: e.target.checked }))} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-on-surface">{u.label}</p>
                              {u.changes.length === 0 ? (
                                <p className="text-[11px] text-on-surface-variant">No changes</p>
                              ) : (
                                <ul className="mt-0.5 space-y-0.5">
                                  {u.changes.map((ch) => (
                                    <li key={ch.field} className="text-[11px] text-on-surface-variant">
                                      <span className="font-medium text-on-surface">{ch.field}:</span>{' '}
                                      <span className="line-through">{ch.old || '—'}</span>{' → '}
                                      <span className="text-on-surface">{ch.new || '—'}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {plan.creates.length === 0 && plan.updates.length === 0 && plan.errors.length === 0 && (
                    <p className="text-sm text-on-surface-variant text-center py-4">Nothing to import from this file.</p>
                  )}
                </div>
              )}

              {/* Step 3: summary */}
              {summary && (
                <div className="space-y-3 text-center py-2">
                  <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '40px' }}>check_circle</span>
                  <p className="text-sm font-semibold text-on-surface">Import complete</p>
                  <div className="flex items-center justify-center gap-4 text-sm">
                    <span className="text-on-surface"><span className="font-bold">{summary.created}</span> created</span>
                    <span className="text-on-surface"><span className="font-bold">{summary.updated}</span> updated</span>
                    <span className="text-on-surface-variant"><span className="font-bold">{summary.skipped}</span> skipped</span>
                  </div>
                  {summary.failed.length > 0 && (
                    <div className="text-left rounded-xl border border-error/30 bg-error/5 p-3">
                      <p className="text-xs font-semibold text-error mb-1">{summary.failed.length} row(s) failed</p>
                      <ul className="space-y-0.5">
                        {summary.failed.map((f) => (
                          <li key={f.row} className="text-[11px] text-on-surface"><span className="font-semibold">Row {f.row}:</span> {f.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="flex items-center justify-end gap-2 p-5 border-t border-outline-variant">
              {summary ? (
                <button onClick={closeDialog} className="px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">Done</button>
              ) : (
                <>
                  <button onClick={closeDialog} className="px-4 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container rounded-xl transition-colors">Cancel</button>
                  {plan && (
                    <button onClick={handleCommit} disabled={loading || applyRows.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                      {loading
                        ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Applying…</>
                        : <>Apply{applyRows.length ? ` (${applyRows.length})` : ''}</>}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Section({ tone, icon, title, action, children }: {
  tone: 'ok' | 'info' | 'warn' | 'error'
  icon: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const toneClass = {
    ok: 'border-emerald-500/30 bg-emerald-500/5',
    info: 'border-primary/30 bg-primary/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    error: 'border-error/30 bg-error/5',
  }[tone]
  const iconClass = { ok: 'text-emerald-600', info: 'text-primary', warn: 'text-amber-600', error: 'text-error' }[tone]
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`material-symbols-outlined ${iconClass}`} style={{ fontSize: '18px' }}>{icon}</span>
          <p className="text-xs font-bold text-on-surface">{title}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// "All / none" toggle for a checkbox group, only meaningful when there's more than one selectable row.
function SelectToggle({ rows, state, setState }: {
  rows: number[]
  state: Record<number, boolean>
  setState: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
}) {
  if (rows.length < 2) return null
  const allOn = rows.every((r) => state[r])
  return (
    <button type="button"
      onClick={() => setState((p) => ({ ...p, ...Object.fromEntries(rows.map((r) => [r, !allOn])) }))}
      className="text-[11px] font-semibold text-primary hover:underline">
      {allOn ? 'Deselect all' : 'Select all'}
    </button>
  )
}
