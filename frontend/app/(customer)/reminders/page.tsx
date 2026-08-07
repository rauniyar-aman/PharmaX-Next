'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { MedicineReminder, ReminderScheduleItem, ReminderFrequency } from '@/types'

const FREQUENCIES: { val: ReminderFrequency; label: string }[] = [
  { val: 'DAILY', label: 'Daily' },
  { val: 'WEEKLY', label: 'Weekly' },
  { val: 'AS_NEEDED', label: 'As Needed' },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function RemindersPage() {
  const [schedule, setSchedule] = useState<ReminderScheduleItem[]>([])
  const [reminders, setReminders] = useState<MedicineReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [medicineName, setMedicineName] = useState('')
  const [dosage, setDosage] = useState('')
  const [timeInput, setTimeInput] = useState('08:00')
  const [times, setTimes] = useState<string[]>([])
  const [frequency, setFrequency] = useState<ReminderFrequency>('DAILY')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/reminders/today/'),
      api.get('/reminders/'),
    ]).then(([todayRes, listRes]) => {
      setSchedule(todayRes.data.data.schedule || [])
      setReminders(listRes.data.data.reminders || [])
    }).catch(() => toast.error('Failed to load reminders.')).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleMarkTaken = async (item: ReminderScheduleItem) => {
    setMarking(`${item.reminder_id}-${item.time}`)
    try {
      await api.post(`/reminders/${item.reminder_id}/mark-taken/`, { time: item.time, date: todayStr() })
      setSchedule((p) => p.map((s) => (s.reminder_id === item.reminder_id && s.time === item.time ? { ...s, taken: !s.taken } : s)))
    } catch {
      toast.error('Could not update dose status.')
    } finally {
      setMarking(null)
    }
  }

  const addTime = () => {
    if (timeInput && !times.includes(timeInput)) setTimes((p) => [...p, timeInput].sort())
  }
  const removeTime = (t: string) => setTimes((p) => p.filter((x) => x !== t))

  const resetForm = () => {
    setMedicineName(''); setDosage(''); setTimes([]); setTimeInput('08:00')
    setFrequency('DAILY'); setStartDate(todayStr()); setEndDate(''); setNotes('')
    setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!medicineName.trim()) { toast.error('Medicine name is required.'); return }
    if (times.length === 0) { toast.error('Add at least one reminder time.'); return }
    setSaving(true)
    try {
      await api.post('/reminders/', {
        medicine_name: medicineName, dosage: dosage || undefined, times: times.join(','),
        frequency, start_date: startDate, end_date: endDate || undefined, notes: notes || undefined,
      })
      toast.success('Reminder created!')
      resetForm()
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not create reminder.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (r: MedicineReminder) => {
    try {
      await api.put(`/reminders/${r.id}/`, { is_active: !r.is_active })
      toast.success(r.is_active ? 'Reminder paused.' : 'Reminder resumed.')
      load()
    } catch {
      toast.error('Could not update reminder.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this reminder?')) return
    setDeletingId(id)
    try {
      await api.delete(`/reminders/${id}/`)
      setReminders((p) => p.filter((r) => r.id !== id))
      setSchedule((p) => p.filter((s) => s.reminder_id !== id))
      toast.success('Reminder deleted.')
    } catch {
      toast.error('Could not delete reminder.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Medicine Reminders</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Keep track of your daily doses.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Reminder
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Medicine Name *</label>
              <input type="text" value={medicineName} onChange={(e) => setMedicineName(e.target.value)} placeholder="e.g., Metformin 500mg"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Dosage</label>
              <input type="text" value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g., 1 tablet"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as ReminderFrequency)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                {FREQUENCIES.map((f) => <option key={f.val} value={f.val}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Reminder Times</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="time" value={timeInput} onChange={(e) => setTimeInput(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                <button type="button" onClick={addTime}
                  className="px-3 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-colors">Add</button>
              </div>
              {times.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {times.map((t) => (
                    <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {t}
                      <button type="button" onClick={() => removeTime(t)}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">End Date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Reminder'}
            </button>
            <button type="button" onClick={resetForm} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">Today's Schedule</h2>
        {schedule.length === 0 ? (
          <div className="text-center py-8 bg-surface rounded-2xl border border-outline-variant">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '36px' }}>medication</span>
            <p className="text-sm text-on-surface-variant mt-2">No doses scheduled for today.</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {schedule.map((item) => (
              <div key={`${item.reminder_id}-${item.time}`} className="flex items-center gap-4 p-4">
                <button onClick={() => handleMarkTaken(item)} disabled={marking === `${item.reminder_id}-${item.time}`}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.taken ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-outline-variant text-transparent hover:border-primary'}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>check</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${item.taken ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>{item.medicine_name}</p>
                  {item.dosage && <p className="text-xs text-on-surface-variant">{item.dosage}</p>}
                </div>
                <span className="text-sm font-semibold text-on-surface flex-shrink-0">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">My Reminders</h2>
        {reminders.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>alarm</span>
            <p className="text-base font-medium text-on-surface mt-3">No reminders yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Add a reminder to keep track of your medicine schedule.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => (
              <div key={r.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>medication</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{r.medicine_name}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {r.dosage ? `${r.dosage} · ` : ''}{FREQUENCIES.find((f) => f.val === r.frequency)?.label} · {r.times}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                    {r.is_active ? 'Active' : 'Paused'}
                  </span>
                  <button onClick={() => toggleActive(r)} className="text-xs font-semibold text-primary hover:underline">
                    {r.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                    className="w-8 h-8 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-error/10 hover:border-error/30 hover:text-error transition-colors disabled:opacity-50">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                      {deletingId === r.id ? 'progress_activity' : 'delete'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
