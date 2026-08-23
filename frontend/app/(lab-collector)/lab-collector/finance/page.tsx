'use client'
import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { CollectorFinanceProfile } from '@/types'

const TABS = [
  { key: 'EARNINGS', label: 'Owed to You' },
  { key: 'COD', label: 'COD Collected' },
] as const

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function num(v: string | null) {
  return Number(v || 0)
}

const METHOD_LABEL: Record<string, string> = {
  CASH_DEPOSIT: 'Cash Deposit at Office',
  GATEWAY_TOPUP: 'Gateway Top-up',
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

export default function LabCollectorFinancePage() {
  const [profile, setProfile] = useState<CollectorFinanceProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('EARNINGS')

  useEffect(() => {
    api.get('/lab-collector/finance/').then((r) => setProfile(r.data.data))
      .catch(() => toast.error('Failed to load finance data.'))
      .finally(() => setLoading(false))
  }, [])

  const earnings = useMemo(() => profile?.earnings_record.earnings || [], [profile])
  const liabilities = useMemo(() => profile?.cod_record.liabilities || [], [profile])
  const oldestAge = profile?.cod_record.oldest_unremitted_age_days ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Finance</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          What PharmaX owes you for collections, and what you still owe back from cash you've collected.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon="hourglass_top" label="Yet to Receive" value={`NPR ${num(profile?.earnings_record.total_pending ?? null).toFixed(0)}`} tone={num(profile?.earnings_record.total_pending ?? null) > 0 ? 'warning' : 'default'} />
          <SummaryCard icon="check_circle" label="Received from PharmaX" value={`NPR ${num(profile?.earnings_record.total_paid ?? null).toFixed(0)}`} tone="success" />
          <SummaryCard icon="payments" label="COD Still to Remit" value={`NPR ${num(profile?.cod_record.total_outstanding ?? null).toFixed(0)}`} tone={num(profile?.cod_record.total_outstanding ?? null) > 0 ? 'warning' : 'default'} />
          <SummaryCard icon="account_balance_wallet" label="Total COD Collected" value={`NPR ${num(profile?.cod_record.total_collected ?? null).toFixed(0)}`} />
        </div>
      )}

      {!loading && oldestAge !== null && oldestAge >= 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-amber-600" style={{ fontSize: '22px' }}>warning</span>
          <p className="text-sm text-amber-800">
            You've been holding COD cash for <span className="font-bold">{oldestAge} days</span> — please remit it at the office soon.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${tab === t.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : tab === 'EARNINGS' ? (
        earnings.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>science</span>
            <p className="mt-2 text-sm">No earnings yet — completed collections will show up here.</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-2 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
              <span>Booking</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {earnings.map((e) => (
                <div key={e.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr] gap-2 px-4 py-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-on-surface">{e.lab_test_name}</p>
                    <p className="text-xs text-on-surface-variant">{fmtDate(e.created_at)}</p>
                  </div>
                  <span className="font-semibold text-on-surface">NPR {num(e.amount).toFixed(0)}</span>
                  <span>
                    {e.status === 'PAID' ? (
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                        Paid {e.paid_at ? fmtDate(e.paid_at) : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">Pending</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : liabilities.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>payments</span>
          <p className="mt-2 text-sm">No COD collections yet.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1.4fr] gap-2 px-4 py-2 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">
            <span>Booking</span>
            <span>Collected</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-outline-variant">
            {liabilities.map((l) => (
              <div key={l.id} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.4fr] gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-semibold text-on-surface">{l.lab_test_name}</p>
                  <p className="text-xs text-on-surface-variant">{fmtDate(l.created_at)}</p>
                </div>
                <span className="font-semibold text-on-surface">NPR {num(l.amount_collected).toFixed(0)}</span>
                <span>
                  {l.status === 'REMITTED' ? (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                      Remitted {l.remitted_at ? fmtDate(l.remitted_at) : ''}{l.remittance_method ? ` · ${METHOD_LABEL[l.remittance_method] || l.remittance_method}` : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">
                      Awaiting remittance{l.days_outstanding != null ? ` · ${l.days_outstanding}d` : ''}
                    </span>
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
