'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorAppointment, AppointmentStatus } from '@/types'

const STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DoctorAppointmentsPage() {
  const [appts, setAppts] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [actingId, setActingId] = useState<string | null>(null)
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setLoading(true)
    const params: any = {}
    if (statusFilter !== 'ALL') params.status = statusFilter
    api.get('/doctor/appointments/', { params }).then((r) => setAppts(r.data.data.appointments || [])).catch(() => toast.error('Failed to load appointments.')).finally(() => setLoading(false))
  }, [statusFilter])
  useEffect(() => { load() }, [load])

  const confirm = async (id: string) => {
    setActingId(id)
    try {
      const res = await api.post(`/doctor/appointments/${id}/confirm/`)
      toast.success(res.data.message || 'Appointment confirmed.')
      load()
    } catch (err: any) {
      // Surfaced verbatim — e.g. "Payment must be completed before this appointment can be confirmed."
      toast.error(err.response?.data?.message || 'Failed to confirm appointment.')
    } finally {
      setActingId(null)
    }
  }

  const setMeetingLink = async (id: string) => {
    const link = (linkDrafts[id] || '').trim()
    if (!link) {
      toast.error('Enter a meeting link first.')
      return
    }
    setActingId(id)
    try {
      await api.post(`/doctor/appointments/${id}/set-meeting-link/`, { meeting_link: link })
      toast.success('Meeting link set.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to set meeting link.')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Appointments</h1>
        <p className="text-sm text-on-surface-variant mt-1">Confirm bookings, share a meeting link, then mark them complete.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {['ALL', ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-24 animate-pulse" />)
        ) : appts.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant text-on-surface-variant text-sm">No appointments found.</div>
        ) : appts.map((a) => (
          <div key={a.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">{a.user?.full_name || 'Patient'}</p>
                <p className="text-xs text-on-surface-variant">{a.user?.email}{a.user?.phone ? ` · ${a.user.phone}` : ''}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{fmtDate(a.scheduled_date)} · {a.time_slot}</p>
                {a.reason && <p className="text-xs text-on-surface-variant mt-0.5 italic">"{a.reason}"</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[a.status]}`}>{a.status}</span>
                {a.is_plus_free ? (
                  <span className="text-[10px] text-on-surface-variant">PharmaX Plus — free</span>
                ) : (
                  <span className="text-[10px] text-on-surface-variant">
                    NPR {Number(a.fee_amount).toFixed(0)} · {a.payment_status === 'PAID' ? 'Paid' : 'Payment pending'}
                  </span>
                )}
              </div>
            </div>

            {/* Action per status — never a generic catch-all control */}
            {a.status === 'PENDING' && (
              <div className="pt-1 border-t border-outline-variant flex items-center justify-between gap-2">
                <p className="text-xs text-on-surface-variant">
                  {a.payment_status === 'PENDING' ? 'Waiting on patient payment before this can be confirmed.' : 'Ready to confirm.'}
                </p>
                <button onClick={() => confirm(a.id)} disabled={actingId === a.id}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex-shrink-0">
                  {actingId === a.id ? 'Confirming...' : 'Confirm'}
                </button>
              </div>
            )}

            {a.status === 'CONFIRMED' && !a.meeting_link && (
              <div className="pt-1 border-t border-outline-variant flex items-center gap-2">
                <input type="text" placeholder="Meeting link (e.g., video call URL)"
                  value={linkDrafts[a.id] ?? ''}
                  onChange={(e) => setLinkDrafts((p) => ({ ...p, [a.id]: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-outline-variant rounded-xl bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
                <button onClick={() => setMeetingLink(a.id)} disabled={actingId === a.id}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex-shrink-0">
                  {actingId === a.id ? 'Saving...' : 'Set Link'}
                </button>
              </div>
            )}

            {a.status === 'CONFIRMED' && a.meeting_link && (
              <div className="pt-1 border-t border-outline-variant flex items-center justify-between gap-2 flex-wrap">
                <a href={a.meeting_link} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate max-w-[60%] flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>videocam</span>
                  {a.meeting_link}
                </a>
                <Link href={`/doctor/appointments/${a.id}`}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity flex-shrink-0">
                  Complete Consultation
                </Link>
              </div>
            )}

            {a.status === 'COMPLETED' && a.meeting_link && (
              <div className="pt-1 border-t border-outline-variant">
                <p className="text-xs text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span>
                  Consultation complete.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
