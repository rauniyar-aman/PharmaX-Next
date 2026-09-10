'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { DailyFinance, DailyFinanceRow, RevenueChannelKey } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
// row.date is a plain 'YYYY-MM-DD' — build it as a local date so it never shifts a day under TZ.
function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-NP', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function localISO(d: Date) {
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 10)
}

// The three payment buckets the user asked to filter by. COD spans both spellings server-side.
const METHODS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'COD', label: 'COD' },
  { value: 'KHALTI', label: 'Khalti' },
  { value: 'ESEWA', label: 'eSewa' },
]

const CHANNEL_META: { key: RevenueChannelKey; label: string; icon: string }[] = [
  { key: 'medicine', label: 'Medicine', icon: 'medication' },
  { key: 'lab-tests', label: 'Lab Tests', icon: 'biotech' },
  { key: 'appointments', label: 'Appointments', icon: 'stethoscope' },
]

const chGross = (row: DailyFinanceRow, key: RevenueChannelKey) => Number(row.channels[key] || 0)

export default function AdminFinanceDailyPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  // Default window = last 30 days (matches the backend default) so the inputs are never blank.
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return localISO(d)
  })
  const [dateTo, setDateTo] = useState(() => localISO(new Date()))
  const [method, setMethod] = useState('')

  const [data, setData] = useState<DailyFinance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  const load = useCallback(() => {
    if (!canAccess) return
    setLoading(true)
    const params: Record<string, string> = {}
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (method) params.payment_method = method
    api.get('/admin/finance/daily/', { params })
      .then((r) => setData(r.data.data))
      .catch(() => toast.error('Failed to load day-wise finance.'))
      .finally(() => setLoading(false))
  }, [canAccess, dateFrom, dateTo, method])

  useEffect(() => { load() }, [load])

  if (!canAccess) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/finance" className="hover:text-primary transition-colors">Finance</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Day-wise</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '26px' }}>calendar_month</span>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Day-wise Finance</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Gross revenue collected per day across all channels — grouped by each paid transaction&apos;s booked/placed date.
          </p>
        </div>
      </div>

      {/* Filters: date range + payment method */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">From</label>
          <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">To</label>
          <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Payment method</label>
          <div className="flex flex-wrap gap-1.5">
            {METHODS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${method === m.value ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Range total — "total finance for all the days" in view */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">
          Total{method ? ` · ${METHODS.find((m) => m.value === method)?.label}` : ''} — {data ? `${fmtDay(data.filters.date_from)} → ${fmtDay(data.filters.date_to)}` : '…'}
        </p>
        <p className="text-4xl font-black mt-1 text-on-surface">{fmt(data?.total.gross ?? 0)}</p>
        <p className="text-xs text-on-surface-variant mt-1">
          {data?.total.count ?? 0} paid transaction{(data?.total.count ?? 0) !== 1 ? 's' : ''} over {data?.days.length ?? 0} day{(data?.days.length ?? 0) !== 1 ? 's' : ''} with revenue
        </p>
      </div>

      {/* Per-channel totals for the range */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {!data ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-24 bg-surface-container-low rounded-2xl animate-pulse" />)
        ) : CHANNEL_META.map((cm) => {
          const t = data.channel_totals.find((c) => c.key === cm.key)
          return (
            <div key={cm.key} className="bg-surface rounded-2xl border border-outline-variant p-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>{cm.icon}</span>
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{cm.label}</p>
              </div>
              <p className="text-xl font-bold text-on-surface mt-1">{fmt(t?.gross ?? 0)}</p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">{t?.count ?? 0} paid</p>
            </div>
          )
        })}
      </div>

      {/* Per-day breakdown */}
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">Date</th>
                {CHANNEL_META.map((cm) => (
                  <th key={cm.key} className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant whitespace-nowrap">{cm.label}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant whitespace-nowrap">Day Total</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-on-surface-variant whitespace-nowrap">Txns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}><td colSpan={CHANNEL_META.length + 3} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>
                ))
              ) : !data || data.days.length === 0 ? (
                <tr><td colSpan={CHANNEL_META.length + 3} className="px-4 py-12 text-center text-on-surface-variant">No paid revenue in this range.</td></tr>
              ) : data.days.map((row) => (
                <tr key={row.date} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{fmtDay(row.date)}</td>
                  {CHANNEL_META.map((cm) => {
                    const v = chGross(row, cm.key)
                    return (
                      <td key={cm.key} className={`px-4 py-3 text-right whitespace-nowrap ${v > 0 ? 'text-on-surface' : 'text-on-surface-variant/40'}`}>
                        {v > 0 ? fmt(v) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-right font-bold text-on-surface whitespace-nowrap">{fmt(row.gross)}</td>
                  <td className="px-4 py-3 text-right text-on-surface-variant whitespace-nowrap">{row.count}</td>
                </tr>
              ))}
            </tbody>
            {data && data.days.length > 0 && (
              <tfoot className="border-t-2 border-outline-variant bg-surface-container-low">
                <tr>
                  <td className="px-4 py-3 font-bold text-on-surface whitespace-nowrap">Total</td>
                  {CHANNEL_META.map((cm) => {
                    const t = data.channel_totals.find((c) => c.key === cm.key)
                    return <td key={cm.key} className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">{fmt(t?.gross ?? 0)}</td>
                  })}
                  <td className="px-4 py-3 text-right font-black text-on-surface whitespace-nowrap">{fmt(data.total.gross)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">{data.total.count}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant">
        Gross is cash collected from paid transactions, grouped by the day each was booked/placed (these rows carry no separate settlement date). COD combines cash-on-delivery and cash-on-collection; doctor appointments have no COD option.
      </p>
    </div>
  )
}
