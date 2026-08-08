'use client'
import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyOrderFulfillment } from '@/types'

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PAID', label: 'Received' },
  { key: 'PENDING', label: 'Yet to Receive' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function num(v: string | null) {
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

export default function PharmacyFinancePage() {
  const [orders, setOrders] = useState<PharmacyOrderFulfillment[]>([])
  const [showFinance, setShowFinance] = useState(true)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    api.get('/pharmacy/orders/').then((r) => {
      setOrders(r.data.data.orders || [])
      setShowFinance(r.data.data.show_finance !== false)
    }).catch(() => toast.error('Failed to load finance data.')).finally(() => setLoading(false))
  }, [])

  // Only fulfillments that have actually earned a payout (i.e. reached DELIVERED) belong on a
  // finance page — everything still in transit has nothing to show yet.
  const settled = useMemo(() => orders.filter((o) => o.payment_status === 'PAID' || o.payment_status === 'PENDING'), [orders])

  const totals = useMemo(() => {
    const earned = settled.reduce((s, o) => s + num(o.payout_gross_amount), 0)
    const commission = settled.reduce((s, o) => s + num(o.payout_commission_amount), 0)
    const received = settled.filter((o) => o.payment_status === 'PAID').reduce((s, o) => s + num(o.payout_amount), 0)
    const pending = settled.filter((o) => o.payment_status === 'PENDING').reduce((s, o) => s + num(o.payout_amount), 0)
    return { earned, commission, received, pending }
  }, [settled])

  const filtered = useMemo(() => {
    if (filter === 'ALL') return settled
    return settled.filter((o) => o.payment_status === filter)
  }, [settled, filter])

  if (!loading && !showFinance) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Finance</h1>
          <p className="text-sm text-on-surface-variant mt-1">Earnings and payouts.</p>
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>visibility_off</span>
          <p className="mt-2 text-sm">Income and payout figures are hidden from your account.</p>
          <p className="text-xs mt-1">Ask the pharmacy owner to grant access from the Team page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Finance</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          What you've earned, PharmaX's commission, what's been paid out, and what's still owed.
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
          <p className="mt-2 text-sm">{settled.length === 0 ? 'No earnings yet — delivered orders will show up here.' : 'No orders match this filter.'}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
            <span>Order</span>
            <span>Earned (Gross)</span>
            <span>Commission</span>
            <span>You Receive (Net)</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-outline-variant">
            {filtered.map((o) => (
              <div key={o.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-mono text-on-surface-variant">#{o.order_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-on-surface-variant">{fmtDate(o.delivered_at)}</p>
                </div>
                <span className="text-on-surface">NPR {num(o.payout_gross_amount).toFixed(0)}</span>
                <span className="text-on-surface-variant">− NPR {num(o.payout_commission_amount).toFixed(0)}</span>
                <span className="font-semibold text-on-surface">NPR {num(o.payout_amount).toFixed(0)}</span>
                <span>
                  {o.payment_status === 'PAID' ? (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                      Paid {o.payout_paid_at ? fmtDate(o.payout_paid_at) : ''}
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
