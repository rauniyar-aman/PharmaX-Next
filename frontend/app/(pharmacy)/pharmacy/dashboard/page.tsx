'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { PharmacyOrderFulfillment, PharmacyListing } from '@/types'
import { usePharmacyRequestsStore } from '@/store/pharmacyRequests'

const ACTIVE_STATUSES = ['ACCEPTED', 'AWAITING_DELIVERY', 'OUT_FOR_DELIVERY']
const LOW_STOCK_THRESHOLD = 5

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

export default function PharmacyDashboardPage() {
  const [orders, setOrders] = useState<PharmacyOrderFulfillment[]>([])
  const [listings, setListings] = useState<PharmacyListing[]>([])
  const [showFinance, setShowFinance] = useState(true)
  const [loading, setLoading] = useState(true)
  const pendingRequests = usePharmacyRequestsStore((s) => s.requests.length)

  useEffect(() => {
    Promise.all([
      api.get('/pharmacy/orders/').then((r) => {
        setOrders(r.data.data.orders || [])
        setShowFinance(r.data.data.show_finance !== false)
      }),
      api.get('/pharmacy/listings/').then((r) => setListings(r.data.data.listings || [])),
    ]).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length
    const delivered = orders.filter((o) => o.status === 'DELIVERED').length
    const pendingPayout = orders.filter((o) => o.payment_status === 'PENDING').reduce((s, o) => s + Number(o.payout_amount || 0), 0)
    const totalPaid = orders.filter((o) => o.payment_status === 'PAID').reduce((s, o) => s + Number(o.payout_amount || 0), 0)
    const lowStock = listings.filter((l) => l.is_available && l.stock_quantity <= LOW_STOCK_THRESHOLD).length
    return { active, delivered, pendingPayout, totalPaid, lowStock }
  }, [orders, listings])

  const recentOrders = orders.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">A quick overview of what needs your attention.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon="inbox" label="Pending Requests" value={String(pendingRequests)} href="/pharmacy/requests" tone={pendingRequests > 0 ? 'warning' : 'default'} />
          <StatCard icon="local_shipping" label="Active Orders" value={String(stats.active)} href="/pharmacy/orders" />
          <StatCard icon="check_circle" label="Delivered" value={String(stats.delivered)} href="/pharmacy/orders" tone="success" />
          {showFinance && (
            <>
              <StatCard icon="account_balance_wallet" label="Pending Payout" value={`NPR ${stats.pendingPayout.toFixed(0)}`} href="/pharmacy/orders" tone={stats.pendingPayout > 0 ? 'warning' : 'default'} />
              <StatCard icon="paid" label="Total Paid Out" value={`NPR ${stats.totalPaid.toFixed(0)}`} tone="success" />
            </>
          )}
          <StatCard icon="production_quantity_limits" label="Low / Out of Stock" value={String(stats.lowStock)} href="/pharmacy/inventory" tone={stats.lowStock > 0 ? 'warning' : 'default'} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-on-surface">Recent Orders</h2>
          <Link href="/pharmacy/orders" className="text-xs font-semibold text-primary">View all →</Link>
        </div>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
        ) : recentOrders.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant py-10 text-center text-on-surface-variant text-sm">No orders yet.</div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-3 sm:grid sm:grid-cols-[100px_1fr_140px_140px_auto] sm:gap-4">
                <div className="min-w-0 sm:contents">
                  <p className="text-xs font-mono text-on-surface-variant">#{o.order_id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-on-surface truncate">{o.items.map((i) => i.medicine_name).join(', ')}</p>
                  <p className="hidden sm:block text-xs text-on-surface-variant">{new Date(o.order_placed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <p className="hidden sm:block text-xs text-on-surface-variant truncate">{o.city || '—'}</p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant whitespace-nowrap sm:justify-self-end">{o.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
