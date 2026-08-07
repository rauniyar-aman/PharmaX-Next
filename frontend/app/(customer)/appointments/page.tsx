'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorAppointment } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

const STATUS_ICONS: Record<string, string> = {
  PENDING: 'hourglass_empty',
  CONFIRMED: 'check_circle',
  COMPLETED: 'task_alt',
  CANCELLED: 'cancel',
}

export default function AppointmentsPage() {
  const [appts, setAppts] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = () => {
    api.get('/doctors/appointments/').then((r) => setAppts(r.data.data.appointments || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this appointment?')) return
    setCancelling(id)
    try {
      await api.put(`/doctors/appointments/${id}/`, { status: 'CANCELLED' })
      toast.success('Appointment cancelled.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not cancel appointment.')
    } finally {
      setCancelling(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!appts.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>stethoscope</span>
      <h2 className="text-xl font-bold text-on-surface">No appointments yet</h2>
      <p className="text-sm text-on-surface-variant">Your booked doctor appointments will appear here</p>
      <Link href="/doctor-consult" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Consult a Doctor
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">My Appointments</h1>
        <span className="text-sm text-on-surface-variant">{appts.length} appointment{appts.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {appts.map((a) => (
          <div key={a.id} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-on-surface">Dr. {a.doctor?.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{a.doctor?.specialty}</p>
              </div>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[a.status] || 'bg-surface-container text-on-surface-variant'}`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>{STATUS_ICONS[a.status]}</span>
                {a.status}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-on-surface-variant">Date</p>
                <p className="font-medium text-on-surface mt-0.5">{new Date(a.scheduled_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Time Slot</p>
                <p className="font-medium text-on-surface mt-0.5">{a.time_slot}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Fee</p>
                <p className="font-medium text-on-surface mt-0.5">NPR {Number(a.fee_amount).toFixed(0)}</p>
              </div>
            </div>
            {a.reason && (
              <div className="text-xs">
                <p className="text-on-surface-variant">Reason</p>
                <p className="font-medium text-on-surface mt-0.5">{a.reason}</p>
              </div>
            )}
            {a.status === 'CONFIRMED' && a.meeting_link && (
              <a href={a.meeting_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                Join Video Call
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
              </a>
            )}
            {(a.status === 'PENDING' || a.status === 'CONFIRMED') && (
              <button onClick={() => handleCancel(a.id)} disabled={cancelling === a.id}
                className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                {cancelling === a.id ? 'Cancelling...' : 'Cancel Appointment'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
