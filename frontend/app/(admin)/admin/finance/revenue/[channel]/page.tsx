'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { RevenueChannel, ChannelTransaction } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}
function humanize(s: string | null | undefined) {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Cost-line labels shipped in each channel's cost_breakdown (see _*_channel_totals in views.py).
const COST_LABELS: Record<string, string> = {
  pharmacy_payouts: 'Pharmacy payouts',
  delivery_earnings: 'Delivery agent earnings',
  collector_earnings: 'Lab collector earnings',
  doctor_payouts: 'Doctor payouts',
}

function StatusPill({ status }: { status: string }) {
  const good = ['DELIVERED', 'COMPLETED', 'REPORT_READY'].includes(status)
  const bad = ['RETURNED', 'CANCELLED', 'PRESCRIPTION_REJECTED'].includes(status)
  const cls = good ? 'bg-emerald-50 text-emerald-600' : bad ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{humanize(status)}</span>
}

type ChannelConfig = {
  label: string
  icon: string
  statuses: string[]
  columns: string[]
  row: (t: ChannelTransaction) => React.ReactNode
}

// One config per revenue channel keeps the drill-down single-file without triplicating the page.
const CONFIG: Record<string, ChannelConfig> = {
  medicine: {
    label: 'Medicine Orders',
    icon: 'medication',
    statuses: ['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
    columns: ['Customer', 'Items', 'Amount', 'Method', 'Status', 'Placed'],
    row: (t) => (
      <>
        <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{t.customer_name || '—'}</td>
        <td className="px-4 py-3 text-on-surface-variant text-xs">{t.item_summary || '—'}</td>
        <td className="px-4 py-3 font-semibold text-on-surface whitespace-nowrap">{fmt(t.total_amount ?? 0)}</td>
        <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">{humanize(t.payment_method)}</td>
        <td className="px-4 py-3"><StatusPill status={t.status} /></td>
        <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(t.placed_at || null)}</td>
      </>
    ),
  },
  'lab-tests': {
    label: 'Lab Tests',
    icon: 'biotech',
    statuses: ['PENDING', 'CONFIRMED', 'SAMPLE_COLLECTED', 'REPORT_READY', 'CANCELLED'],
    columns: ['Customer', 'Test', 'Amount', 'Method', 'Status', 'Booked'],
    row: (t) => (
      <>
        <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{t.customer_name || '—'}</td>
        <td className="px-4 py-3 text-on-surface-variant text-xs">{t.lab_test_name || '—'}</td>
        <td className="px-4 py-3 font-semibold text-on-surface whitespace-nowrap">{fmt(t.total_amount ?? 0)}</td>
        <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">{humanize(t.payment_method)}</td>
        <td className="px-4 py-3"><StatusPill status={t.status} /></td>
        <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(t.booked_at || null)}</td>
      </>
    ),
  },
  appointments: {
    label: 'Doctor Appointments',
    icon: 'stethoscope',
    statuses: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
    columns: ['Patient', 'Doctor', 'Fee', 'Method', 'Status', 'Booked'],
    row: (t) => (
      <>
        <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{t.patient_name || '—'}</td>
        <td className="px-4 py-3 text-on-surface-variant text-xs">{t.doctor_name || '—'}</td>
        <td className="px-4 py-3 font-semibold text-on-surface whitespace-nowrap">
          {fmt(t.fee_charged ?? 0)}
          {t.is_plus_free && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wide">Plus-free</span>}
        </td>
        <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">{humanize(t.payment_method)}</td>
        <td className="px-4 py-3"><StatusPill status={t.status} /></td>
        <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(t.booked_at || null)}</td>
      </>
    ),
  },
}

function RevenueChannelContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)

  const channel = String(params.channel || '')
  const cfg = CONFIG[channel]

  const [channelData, setChannelData] = useState<RevenueChannel | null>(null)
  const [rows, setRows] = useState<ChannelTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  const load = useCallback(() => {
    if (!canAccess || !cfg) return
    setLoading(true)
    const params: Record<string, string | number> = { page, limit: 20 }
    if (statusFilter) params.status = statusFilter
    api.get(`/admin/finance/channels/${channel}/`, { params })
      .then((r) => {
        setChannelData(r.data.data.channel)
        setRows(r.data.data.transactions || [])
        setTotalPages(r.data.data.pagination?.totalPages || 1)
      })
      .catch(() => toast.error('Failed to load channel finance.'))
      .finally(() => setLoading(false))
  }, [canAccess, cfg, channel, statusFilter, page])

  useEffect(() => { load() }, [load])

  if (!canAccess) return null

  if (!cfg) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Link href="/admin/finance" className="hover:text-primary transition-colors">Finance</Link>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          <span className="text-on-surface font-medium">Unknown channel</span>
        </div>
        <div className="text-center py-24 text-on-surface-variant">Revenue channel not found.</div>
      </div>
    )
  }

  const netPositive = channelData ? Number(channelData.net) >= 0 : true

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/finance" className="hover:text-primary transition-colors">Finance</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{cfg.label}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '26px' }}>{cfg.icon}</span>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{cfg.label}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Gross revenue collected and net after this channel&apos;s costs.</p>
        </div>
      </div>

      {!channelData ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-surface-container-low rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-surface rounded-2xl border border-outline-variant p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Gross Revenue</p>
              <p className="text-3xl font-black mt-1 text-on-surface">{fmt(channelData.gross)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">{channelData.count} paid transaction{channelData.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-surface rounded-2xl border border-outline-variant p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Costs</p>
              <p className="text-3xl font-black mt-1 text-on-surface">{fmt(channelData.cost_total)}</p>
              <div className="mt-2 space-y-0.5">
                {Object.entries(channelData.cost_breakdown).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[10px] text-on-surface-variant">
                    <span>{COST_LABELS[k] || humanize(k)}</span>
                    <span className="font-semibold text-on-surface">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`rounded-2xl border p-5 ${netPositive ? 'bg-emerald-50 border-emerald-200' : 'bg-error/5 border-error/30'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${netPositive ? 'text-emerald-600' : 'text-error'}`}>Net After Costs</p>
              <p className={`text-3xl font-black mt-1 ${netPositive ? 'text-emerald-600' : 'text-error'}`}>{fmt(channelData.net)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">Gross minus this channel&apos;s costs</p>
            </div>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Gross is cash collected from paid {cfg.label.toLowerCase()}. Costs are this channel&apos;s accrued payouts &amp; earnings and may settle after revenue is collected, so net is directional.
          </p>
        </>
      )}

      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary">
          <option value="">All Statuses</option>
          {cfg.statuses.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {cfg.columns.map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={cfg.columns.length} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={cfg.columns.length} className="px-4 py-12 text-center text-on-surface-variant">No paid transactions found</td></tr>
              ) : rows.map((t) => (
                <tr key={t.id} className="hover:bg-surface-container-low transition-colors">{cfg.row(t)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          {[...Array(Math.min(totalPages, 7))].map((_, i) => (
            <button key={i + 1} onClick={() => setPage(i + 1)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function RevenueChannelPage() {
  return (
    <Suspense fallback={<div className="h-40 bg-surface-container-low rounded-2xl animate-pulse" />}>
      <RevenueChannelContent />
    </Suspense>
  )
}
