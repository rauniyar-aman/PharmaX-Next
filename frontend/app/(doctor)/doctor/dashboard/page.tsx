'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Doctor, DoctorAppointment } from '@/types'

function StatCard({ icon, label, value, href, tone = 'default' }: {
  icon: string; label: string; value: string; href?: string; tone?: 'default' | 'warning' | 'success'
}) {
  const toneClasses = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-50 text-amber-600',
    success: 'bg-emerald-50 text-emerald-600',
  }[tone]
  const content = (
    <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3 h-full hover:border-primary/40 transition-colors">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
      </div>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DoctorDashboardPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/doctor/profile/'),
      api.get('/doctor/appointments/'),
    ]).then(([profileRes, apptRes]) => {
      setDoctor(profileRes.data.data.doctor)
      setAppointments(apptRes.data.data.appointments || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const today = todayStr()
  const todaysSchedule = useMemo(
    () => appointments
      .filter((a) => a.scheduled_date === today && (a.status === 'PENDING' || a.status === 'CONFIRMED'))
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [appointments, today]
  )
  const upcomingCount = useMemo(
    () => appointments.filter((a) => a.scheduled_date >= today && (a.status === 'PENDING' || a.status === 'CONFIRMED')).length,
    [appointments, today]
  )
  const pendingConfirmCount = useMemo(() => appointments.filter((a) => a.status === 'PENDING').length, [appointments])
  const completedCount = useMemo(() => appointments.filter((a) => a.status === 'COMPLETED').length, [appointments])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {loading ? 'Loading...' : doctor ? `Welcome back, Dr. ${doctor.name} — ${doctor.specialty}` : 'A quick overview of what needs your attention.'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon="event_upcoming" label="Upcoming Appointments" value={String(upcomingCount)} href="/doctor/appointments" />
          <StatCard icon="hourglass_top" label="Awaiting Your Confirmation" value={String(pendingConfirmCount)} href="/doctor/appointments" tone={pendingConfirmCount > 0 ? 'warning' : 'default'} />
          <StatCard icon="check_circle" label="Completed" value={String(completedCount)} href="/doctor/appointments" tone="success" />
          <StatCard icon="star" label="Rating" value={doctor ? `${Number(doctor.rating).toFixed(1)} (${doctor.total_reviews})` : '—'} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-on-surface">Today's Schedule</h2>
          <Link href="/doctor/appointments" className="text-xs font-semibold text-primary">View all →</Link>
        </div>
        {loading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
        ) : todaysSchedule.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant py-10 text-center text-on-surface-variant text-sm">Nothing scheduled for today.</div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {todaysSchedule.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{a.time_slot}</p>
                  <p className="text-xs text-on-surface-variant truncate">{a.user?.full_name || 'Patient'}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[a.status]}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/doctor/availability" className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>event_available</span>
          <div>
            <p className="text-sm font-semibold text-on-surface">Manage Availability</p>
            <p className="text-xs text-on-surface-variant">Set your weekly schedule</p>
          </div>
        </Link>
        <Link href="/doctor/appointments" className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>calendar_month</span>
          <div>
            <p className="text-sm font-semibold text-on-surface">All Appointments</p>
            <p className="text-xs text-on-surface-variant">Confirm, set links, complete</p>
          </div>
        </Link>
        <Link href="/doctor/earnings" className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>account_balance_wallet</span>
          <div>
            <p className="text-sm font-semibold text-on-surface">Earnings</p>
            <p className="text-xs text-on-surface-variant">Your payout ledger</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
