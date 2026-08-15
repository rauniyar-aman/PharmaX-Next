'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface ReportsData {
  total_revenue: number
  monthly_revenue: number
  total_orders: number
  cancelled_count: number
  total_customers: number
  pending_prescriptions: number
  order_status_counts: { status: string; count: number }[]
  payment_method_counts: { payment_method: string; count: number }[]
  top_medicines: { medicine: { id: string; name: string; brand: string }; total_qty: number; revenue: number }[]
  monthly_trend: { month: string; orders: number; revenue: number }[]
}

const STATUS_COLORS: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'bg-amber-400',
  PRESCRIPTION_REJECTED: 'bg-error',
  PLACED: 'bg-blue-400',
  CONFIRMED: 'bg-secondary',
  PROCESSING: 'bg-amber-400',
  SHIPPED: 'bg-primary',
  OUT_FOR_DELIVERY: 'bg-purple-400',
  DELIVERED: 'bg-emerald-500',
  RETURNED: 'bg-error',
}

const PAYMENT_COLORS: Record<string, string> = {
  CASH_ON_DELIVERY: 'bg-primary',
  ESEWA: 'bg-emerald-500',
  KHALTI: 'bg-purple-400',
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-on-surface">{label.replace(/_/g, ' ')}</span>
        <span className="text-on-surface-variant">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container-low overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/reports/').then((r) => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cards = data ? [
    { label: 'Total Revenue', value: `NPR ${data.total_revenue.toLocaleString()}`, icon: 'payments', color: 'bg-emerald-50 text-emerald-600' },
    { label: 'This Month', value: `NPR ${data.monthly_revenue.toLocaleString()}`, icon: 'calendar_month', color: 'bg-primary/10 text-primary' },
    { label: 'Total Orders', value: data.total_orders, icon: 'package_2', color: 'bg-secondary/10 text-secondary' },
    { label: 'Cancelled Orders', value: data.cancelled_count, icon: 'cancel', color: 'bg-error/10 text-error' },
    { label: 'Total Customers', value: data.total_customers, icon: 'group', color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Pending Rx', value: data.pending_prescriptions, icon: 'description', color: 'bg-amber-50 text-amber-600' },
  ] : []

  const statusTotal = data?.order_status_counts.reduce((s, o) => s + o.count, 0) || 0
  const paymentTotal = data?.payment_method_counts.reduce((s, p) => s + p.count, 0) || 0
  const maxMonthlyRevenue = Math.max(1, ...(data?.monthly_trend.map((m) => m.revenue) || [1]))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Reports & Analytics</h1>
        <p className="text-sm text-on-surface-variant mt-1">Overview of platform performance</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-5 h-28 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-surface rounded-2xl border border-outline-variant p-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color} mb-3`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{c.icon}</span>
                </div>
                <p className="text-2xl font-bold text-on-surface">{c.value}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
              <h2 className="text-sm font-bold text-on-surface">Orders by Status</h2>
              {data?.order_status_counts.length ? (
                <div className="space-y-3">
                  {data.order_status_counts.map((s) => (
                    <BarRow key={s.status} label={s.status} count={s.count} total={statusTotal} color={STATUS_COLORS[s.status] || 'bg-on-surface-variant'} />
                  ))}
                </div>
              ) : <p className="text-sm text-on-surface-variant text-center py-6">No orders yet</p>}
            </div>

            <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
              <h2 className="text-sm font-bold text-on-surface">Payment Methods</h2>
              {data?.payment_method_counts.length ? (
                <div className="space-y-3">
                  {data.payment_method_counts.map((p) => (
                    <BarRow key={p.payment_method} label={p.payment_method} count={p.count} total={paymentTotal} color={PAYMENT_COLORS[p.payment_method] || 'bg-on-surface-variant'} />
                  ))}
                </div>
              ) : <p className="text-sm text-on-surface-variant text-center py-6">No orders yet</p>}
            </div>
          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
            <h2 className="text-sm font-bold text-on-surface">Monthly Revenue Trend</h2>
            {data?.monthly_trend.length ? (
              <div className="flex items-end gap-3 h-40 pt-2">
                {data.monthly_trend.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full group relative">
                    <span className="text-[10px] font-semibold text-on-surface opacity-0 group-hover:opacity-100 transition-opacity">NPR {m.revenue.toLocaleString()}</span>
                    <div className="w-full max-w-10 bg-primary rounded-t-lg transition-all" style={{ height: `${Math.max(4, (m.revenue / maxMonthlyRevenue) * 100)}%` }} />
                    <span className="text-[10px] text-on-surface-variant">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-on-surface-variant text-center py-6">Not enough data yet</p>}
          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant">
            <p className="text-sm font-bold text-on-surface p-5 border-b border-outline-variant">Top Selling Medicines</p>
            {data?.top_medicines.length ? (
              <div className="divide-y divide-outline-variant">
                {data.top_medicines.map((t, i) => (
                  <div key={t.medicine.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-surface-container-low flex items-center justify-center text-xs font-bold text-on-surface-variant flex-shrink-0">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{t.medicine.name}</p>
                        <p className="text-xs text-on-surface-variant">{t.medicine.brand}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-on-surface">{t.total_qty} sold</p>
                      <p className="text-xs text-on-surface-variant">NPR {t.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-on-surface-variant text-center py-8">No sales yet</p>}
          </div>
        </>
      )}
    </div>
  )
}
