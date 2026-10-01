'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { todayDateStr } from '@/lib/dates'
import DateField from '@/components/ui/DateField'
import type { DoctorDateAvailability } from '@/types'

/**
 * Per-date exceptions to the weekly pattern — a one-off day off, or a single day on different hours
 * (including a day the weekly pattern never covers). A row here wins outright for its date on the
 * booking side (backend scheduling.working_hours reads it first), so this is where a doctor blocks a
 * leave day or opens a one-off clinic without touching every other week.
 */

type Draft = {
  date: string
  is_available: boolean
  start_time: string
  end_time: string
  slot_duration_minutes: number
  note: string
}

const NEW_DRAFT = (): Draft => ({
  date: todayDateStr(),
  is_available: false,
  start_time: '09:00',
  end_time: '17:00',
  slot_duration_minutes: 20,
  note: '',
})

function formatDate(iso: string): string {
  // Parse the parts rather than `new Date(iso)`, which reads a bare YYYY-MM-DD as UTC midnight and
  // can render the day before in Nepal's timezone.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DateAvailabilityManager() {
  const [rows, setRows] = useState<DoctorDateAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/doctor/availability/dates/')
      .then((r) => setRows(r.data.data.dates || []))
      .catch(() => toast.error('Failed to load date exceptions.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const patchDraft = (patch: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))

  const add = async () => {
    if (!draft) return
    if (draft.is_available && draft.start_time >= draft.end_time) {
      toast.error('Start time must be before end time.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        date: draft.date,
        is_available: draft.is_available,
        note: draft.note,
      }
      if (draft.is_available) {
        body.start_time = draft.start_time
        body.end_time = draft.end_time
        body.slot_duration_minutes = draft.slot_duration_minutes
      }
      await api.post('/doctor/availability/dates/', body)
      toast.success(draft.is_available ? 'Special hours added.' : 'Day off added.')
      setDraft(null)
      load()
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: DoctorDateAvailability) => {
    const warn = row.booked_appointments > 0
      ? `${row.booked_appointments} patient(s) are booked on ${formatDate(row.date)}. Removing this entry restores your normal hours for that day — it does not cancel those bookings. Continue?`
      : `Remove the entry for ${formatDate(row.date)}?`
    if (!confirm(warn)) return
    setBusyId(row.id)
    try {
      await api.delete(`/doctor/availability/dates/${row.id}/`)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      toast.success('Entry removed.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-on-surface">Specific dates</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Block a day off, or open one day on different hours. A date set here overrides your weekly pattern for that day only.
          </p>
        </div>
        {!draft && (
          <button onClick={() => setDraft(NEW_DRAFT())}
            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1 flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>Add a date
          </button>
        )}
      </div>

      {draft && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <DateField min={todayDateStr()} value={draft.date} onChange={(e) => patchDraft({ date: e.target.value })}
              className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary" />
            <div className="flex rounded-lg overflow-hidden border border-outline-variant text-xs">
              <button onClick={() => patchDraft({ is_available: false })}
                className={`px-3 py-1.5 font-semibold transition-colors ${!draft.is_available ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container'}`}>
                Day off
              </button>
              <button onClick={() => patchDraft({ is_available: true })}
                className={`px-3 py-1.5 font-semibold transition-colors ${draft.is_available ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container'}`}>
                Special hours
              </button>
            </div>
          </div>

          {draft.is_available && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <input type="time" value={draft.start_time} onChange={(e) => patchDraft({ start_time: e.target.value })}
                  className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
                <span className="text-xs text-on-surface-variant">to</span>
                <input type="time" value={draft.end_time} onChange={(e) => patchDraft({ end_time: e.target.value })}
                  className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <label className="text-xs text-on-surface-variant whitespace-nowrap">Slot length</label>
                <select value={draft.slot_duration_minutes} onChange={(e) => patchDraft({ slot_duration_minutes: Number(e.target.value) })}
                  className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary">
                  {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </div>
          )}

          <input type="text" value={draft.note} onChange={(e) => patchDraft({ note: e.target.value })}
            placeholder="Private note — e.g. Conference, Public holiday (only you see this)"
            className="w-full px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary" />

          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => setDraft(null)} className="text-xs font-semibold text-on-surface-variant hover:underline">Cancel</button>
            <button onClick={add} disabled={saving}
              className="px-4 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : rows.length === 0 && !draft ? (
        <p className="text-sm text-on-surface-variant italic py-2">No date exceptions. Your weekly pattern applies to every upcoming day.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="bg-surface rounded-2xl border border-outline-variant px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-on-surface">{formatDate(row.date)}</span>
                  {row.is_available ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container">
                      {row.start_time?.slice(0, 5)}–{row.end_time?.slice(0, 5)}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-error-container text-on-error-container">Day off</span>
                  )}
                  {row.booked_appointments > 0 && (
                    <span className="text-xs text-on-surface-variant">{row.booked_appointments} booked</span>
                  )}
                </div>
                {row.note && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{row.note}</p>}
              </div>
              <button onClick={() => remove(row)} disabled={busyId === row.id}
                className="text-xs font-semibold text-error hover:underline disabled:opacity-50 flex-shrink-0">
                {busyId === row.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
