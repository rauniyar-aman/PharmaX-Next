'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorPatientSummary } from '@/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function FollowUpBadge({ days }: { days: number | null }) {
  if (days === null) return null
  if (days < 0) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>warning</span>
        Follow-up overdue by {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-secondary/10 text-secondary whitespace-nowrap">
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>event_upcoming</span>
      {days === 0 ? 'Follow-up due today' : `Follow-up in ${days} day${days !== 1 ? 's' : ''}`}
    </span>
  )
}

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<DoctorPatientSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/doctor/patients/').then((r) => setPatients(r.data.data.patients || [])).catch(() => toast.error('Failed to load patients.')).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Patients</h1>
        <p className="text-sm text-on-surface-variant mt-1">Everyone you've had an appointment with, and their history with you.</p>
      </div>

      <div className="space-y-2">
        {loading ? (
          [...Array(4)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-16 animate-pulse" />)
        ) : patients.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant text-on-surface-variant text-sm">
            No patients yet — they'll show up here once you've had an appointment together.
          </div>
        ) : patients.map((p) => (
          <Link key={p.user_id} href={`/doctor/patients/${p.user_id}`}
            className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center justify-between gap-3 flex-wrap hover:border-primary/40 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">{p.full_name}</p>
              <p className="text-xs text-on-surface-variant">{p.email}{p.phone ? ` · ${p.phone}` : ''}</p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs text-on-surface-variant">{p.appointment_count} visit{p.appointment_count !== 1 ? 's' : ''}</p>
                <p className="text-xs text-on-surface-variant">Last: {fmtDate(p.last_visit)}</p>
              </div>
              <FollowUpBadge days={p.days_until_follow_up} />
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>chevron_right</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
