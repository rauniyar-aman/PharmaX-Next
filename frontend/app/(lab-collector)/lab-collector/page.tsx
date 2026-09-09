'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { LabTestBooking } from '@/types'

interface DashboardData {
  is_online: boolean
  is_verified: boolean
  stats: {
    to_collect: number
    awaiting_report: number
    completed: number
    today_count: number
    earnings_pending: string
    cod_outstanding: string
  }
  upcoming: LabTestBooking[]
}

/** Full amounts (toLocaleString), not the K-abbreviated form — same call the admin dashboard's
 * revenue figure was recently switched to, so a collector always sees the exact rupee value. */
function money(v: string) {
  return `NPR ${Number(v || 0).toLocaleString()}`
}

function StatCard({ icon, label, value, tone = 'default', href }: {
  icon: string; label: string; value: string; tone?: 'default' | 'warning' | 'success' | 'secondary'; href?: string
}) {
  const toneClasses = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-50 text-amber-600',
    success: 'bg-emerald-50 text-emerald-600',
    secondary: 'bg-secondary/10 text-secondary',
  }[tone]
  const inner = (
    <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3 h-full">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
      </div>
    </div>
  )
  return href ? <Link href={href} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner
}

// Same pill vocabulary as the Active page's step chain — kept in sync deliberately.
const STATUS_PILL: Record<string, { label: string; color: string }> = {
  CONFIRMED:        { label: 'Awaiting collection', color: 'bg-amber-50 text-amber-600' },
  EN_ROUTE:         { label: 'On the way',          color: 'bg-indigo-50 text-indigo-600' },
  ARRIVED:          { label: 'At the patient',      color: 'bg-blue-50 text-blue-600' },
  SAMPLE_COLLECTED: { label: 'Sample collected',    color: 'bg-primary/10 text-primary' },
  SUBMITTED_TO_LAB: { label: 'Submitted to lab',    color: 'bg-purple-50 text-purple-600' },
}

export default function LabCollectorDashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/lab-collector/dashboard/').then((r) => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  const firstName = user?.full_name?.split(' ')[0] || 'there'
  const online = data?.is_online

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Hi, {firstName}</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {online
            ? "You're online — new collections can be assigned to you."
            : "You're offline. Flip the switch in the top bar to start receiving collections."}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard icon="pending_actions" label="To Collect" value={String(data?.stats.to_collect ?? 0)} href="/lab-collector/active" />
            <StatCard icon="hourglass_top" label="Awaiting Report" value={String(data?.stats.awaiting_report ?? 0)} tone="secondary" href="/lab-collector/active" />
            <StatCard icon="task_alt" label="Completed" value={String(data?.stats.completed ?? 0)} tone="success" />
            <StatCard icon="today" label="Today" value={String(data?.stats.today_count ?? 0)} />
            <StatCard icon="account_balance_wallet" label="Earnings Pending" value={money(data?.stats.earnings_pending ?? '0')} tone={Number(data?.stats.earnings_pending || 0) > 0 ? 'warning' : 'default'} href="/lab-collector/finance" />
            <StatCard icon="payments" label="COD to Remit" value={money(data?.stats.cod_outstanding ?? '0')} tone={Number(data?.stats.cod_outstanding || 0) > 0 ? 'warning' : 'default'} href="/lab-collector/finance" />
          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant">
              <h2 className="text-sm font-bold text-on-surface">Upcoming collections</h2>
              <Link href="/lab-collector/active" className="text-xs font-semibold text-primary hover:underline">View all</Link>
            </div>
            {(!data || data.upcoming.length === 0) ? (
              <div className="py-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '36px' }}>event_available</span>
                <p className="mt-2 text-sm">No upcoming collections right now.</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant">
                {data.upcoming.map((b) => {
                  const pill = STATUS_PILL[b.status] || { label: b.status.replace(/_/g, ' '), color: 'bg-surface-container text-on-surface-variant' }
                  return (
                    <Link key={b.id} href="/lab-collector/active" className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-container-low transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{b.lab_test.name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                          {b.user?.full_name || 'Patient'} · {b.scheduled_date} · {b.time_slot}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${pill.color}`}>{pill.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/lab-collector/active" className="flex items-center gap-3 bg-surface rounded-2xl border border-outline-variant p-4 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '24px' }}>science</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">Active Collections</p>
                <p className="text-xs text-on-surface-variant">Work through your assigned samples.</p>
              </div>
            </Link>
            <Link href="/lab-collector/finance" className="flex items-center gap-3 bg-surface rounded-2xl border border-outline-variant p-4 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '24px' }}>account_balance_wallet</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">Finance</p>
                <p className="text-xs text-on-surface-variant">Earnings owed and COD to remit.</p>
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
