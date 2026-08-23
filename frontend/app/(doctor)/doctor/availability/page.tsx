'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorAvailability } from '@/types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Draft = { start_time: string; end_time: string; slot_duration_minutes: number; is_active: boolean }

const DEFAULT_DRAFT: Draft = { start_time: '09:00', end_time: '17:00', slot_duration_minutes: 20, is_active: true }

export default function DoctorAvailabilityPage() {
  const [rows, setRows] = useState<Record<number, DoctorAvailability>>({})
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/doctor/availability/').then((r) => {
      const list: DoctorAvailability[] = r.data.data.availability || []
      const byDay: Record<number, DoctorAvailability> = {}
      const draftsByDay: Record<number, Draft> = {}
      for (const row of list) {
        byDay[row.day_of_week] = row
        draftsByDay[row.day_of_week] = {
          start_time: row.start_time.slice(0, 5),
          end_time: row.end_time.slice(0, 5),
          slot_duration_minutes: row.slot_duration_minutes,
          is_active: row.is_active,
        }
      }
      setRows(byDay)
      setDrafts((prev) => ({ ...prev, ...draftsByDay }))
    }).catch(() => toast.error('Failed to load availability.')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const draftFor = (day: number): Draft => drafts[day] || DEFAULT_DRAFT
  const updateDraft = (day: number, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [day]: { ...draftFor(day), ...patch } }))
  }

  const save = async (day: number) => {
    const draft = draftFor(day)
    if (draft.start_time >= draft.end_time) {
      toast.error('Start time must be before end time.')
      return
    }
    setSaving(day)
    try {
      const existing = rows[day]
      if (existing) {
        const res = await api.patch(`/doctor/availability/${existing.id}/`, draft)
        setRows((prev) => ({ ...prev, [day]: res.data.data.availability }))
        toast.success('Availability updated.')
      } else {
        const res = await api.post('/doctor/availability/', { day_of_week: day, ...draft })
        setRows((prev) => ({ ...prev, [day]: res.data.data.availability }))
        toast.success('Availability added.')
        setExpanded((prev) => ({ ...prev, [day]: false }))
      }
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to save.')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (day: number) => {
    const existing = rows[day]
    if (!existing) return
    if (!confirm(`Remove your ${WEEKDAYS[day]} availability pattern?`)) return
    setDeleting(day)
    try {
      await api.delete(`/doctor/availability/${existing.id}/`)
      setRows((prev) => {
        const next = { ...prev }
        delete next[day]
        return next
      })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[day]
        return next
      })
      toast.success('Availability removed.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove.')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="space-y-2 max-w-2xl">{[...Array(7)].map((_, i) => <div key={i} className="h-16 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Availability</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Set the days and hours you're available for consultations. Patients only ever see slots computed from what's configured here.
        </p>
      </div>

      <div className="space-y-2">
        {WEEKDAYS.map((label, day) => {
          const existing = rows[day]
          const draft = draftFor(day)
          const isOpen = !!existing || !!expanded[day]

          if (!isOpen) {
            return (
              <button key={day} onClick={() => setExpanded((prev) => ({ ...prev, [day]: true }))}
                className="w-full flex items-center justify-between gap-2 bg-surface rounded-2xl border border-dashed border-outline-variant px-4 py-3 text-sm text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                <span>{label}</span>
                <span className="flex items-center gap-1 text-xs font-semibold">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>Not available — add hours
                </span>
              </button>
            )
          }

          return (
            <div key={day} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-on-surface w-24 flex-shrink-0">{label}</span>
                  {existing && (
                    <label className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer">
                      <input type="checkbox" checked={draft.is_active} onChange={(e) => updateDraft(day, { is_active: e.target.checked })}
                        className="w-4 h-4 rounded accent-primary" />
                      Active
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {existing && (
                    <button onClick={() => remove(day)} disabled={deleting === day}
                      className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                      {deleting === day ? 'Removing...' : 'Remove'}
                    </button>
                  )}
                  {!existing && (
                    <button onClick={() => setExpanded((prev) => ({ ...prev, [day]: false }))}
                      className="text-xs font-semibold text-on-surface-variant hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                  <input type="time" value={draft.start_time} onChange={(e) => updateDraft(day, { start_time: e.target.value })}
                    className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
                  <span className="text-xs text-on-surface-variant">to</span>
                  <input type="time" value={draft.end_time} onChange={(e) => updateDraft(day, { end_time: e.target.value })}
                    className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <label className="text-xs text-on-surface-variant whitespace-nowrap">Slot length</label>
                  <select value={draft.slot_duration_minutes} onChange={(e) => updateDraft(day, { slot_duration_minutes: Number(e.target.value) })}
                    className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary">
                    {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
                <button onClick={() => save(day)} disabled={saving === day}
                  className="px-4 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex-shrink-0">
                  {saving === day ? 'Saving...' : existing ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
