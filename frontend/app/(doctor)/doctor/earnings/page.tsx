'use client'
import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorPayout } from '@/types'

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PAID', label: 'Received' },
  { key: 'PENDING', label: 'Yet to Receive' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function num(v: string) {
  return Number(v || 0)
}

function SummaryCard({ icon, label, value, tone = 'default' }: {
  icon: string; label: string; value: string; tone?: 'default' | 'warning' | 'success'
}) {
  const toneClasses = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-amber-50 text-amber-600',
    success: 'bg-emerald-50 text-emerald-600',
  }[tone]
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${toneClasses}`}>
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function DoctorEarningsPage() {
  const [payouts, setPayouts] = useState<DoctorPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    api.get('/doctor/payouts/').then((r) => setPayouts(r.data.data.payouts || [])).catch(() => toast.error('Failed to load earnings.')).finally(() => setLoading(false))
  }, [])

  const totals = useMemo(() => {
    const earned = payouts.reduce((s, p) => s + num(p.gross_amount), 0)
    const commission = payouts.reduce((s, p) => s + num(p.commission_amount), 0)
    const received = payouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + num(p.net_payable), 0)
    const pending = payouts.filter((p) => p.status === 'PENDING').reduce((s, p) => s + num(p.net_payable), 0)
    return { earned, commission, received, pending }
  }, [payouts])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return payouts
    return payouts.filter((p) => p.status === filter)
  }, [payouts, filter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Earnings</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          What you've earned per consultation, PharmaX's commission, and what's been paid out.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon="payments" label="Total Earned (Gross)" value={`NPR ${totals.earned.toFixed(0)}`} />
          <SummaryCard icon="percent" label="Platform Commission" value={`NPR ${totals.commission.toFixed(0)}`} />
          <SummaryCard icon="check_circle" label="Received So Far" value={`NPR ${totals.received.toFixed(0)}`} tone="success" />
          <SummaryCard icon="hourglass_top" label="Yet to Receive" value={`NPR ${totals.pending.toFixed(0)}`} tone={totals.pending > 0 ? 'warning' : 'default'} />
        </div>
      )}

      <p className="text-xs text-on-surface-variant -mt-2">
        Received + Yet to Receive should always equal Total Earned − Platform Commission — that's what you're owed net of commission.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>account_balance_wallet</span>
          <p className="mt-2 text-sm">{payouts.length === 0 ? 'No earnings yet — completed consultations will show up here.' : 'No payouts match this filter.'}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
            <span>Patient / Date</span>
            <span>Earned (Gross)</span>
            <span>Commission</span>
            <span>You Receive (Net)</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-outline-variant">
            {filtered.map((p) => (
              <div key={p.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs text-on-surface font-medium">{p.patient_name || '—'}</p>
                  <p className="text-xs text-on-surface-variant">{fmtDate(p.appointment_date)}</p>
                </div>
                <span className="text-on-surface">NPR {num(p.gross_amount).toFixed(0)}</span>
                <span className="text-on-surface-variant">− NPR {num(p.commission_amount).toFixed(0)} ({Number(p.commission_rate)}%)</span>
                <span className="font-semibold text-on-surface">NPR {num(p.net_payable).toFixed(0)}</span>
                <span>
                  {p.status === 'PAID' ? (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                      Paid {p.paid_at ? fmtDate(p.paid_at) : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">Pending</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
