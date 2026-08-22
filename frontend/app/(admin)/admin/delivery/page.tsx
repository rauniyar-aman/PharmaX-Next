'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import api from '@/lib/api'
import type { TrackingFulfillment } from '@/types'

const LiveTrackingMap = dynamic(() => import('@/components/map/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

const TRACKING_POLL_INTERVAL_MS = 10000

// The real Order.status lifecycle — sync_order_status() in matching.py only ever sets these.
// (CONFIRMED/PROCESSING/SHIPPED/OUT_FOR_DELIVERY exist in the model's legacy choices but nothing
// live sets them; a page built around them never highlights anything real. OUT_FOR_DELIVERY in
// particular only ever exists as a per-fulfillment status, never on the order itself — see the
// fulfillment badges below for that.)
const STATUSES = ['ALL', 'BROADCASTING', 'AWAITING_PAYMENT', 'NO_PHARMACY_FOUND', 'PLACED', 'DELIVERED', 'CANCELLED']
const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  BROADCASTING:      { label: 'Finding Pharmacies', color: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' },
  AWAITING_PAYMENT:  { label: 'Awaiting Payment',    color: 'bg-amber-100 text-amber-700',                 dot: 'bg-amber-500' },
  NO_PHARMACY_FOUND: { label: 'No Pharmacy Found',   color: 'bg-error/10 text-error',                      dot: 'bg-error' },
  PLACED:            { label: 'Placed',              color: 'bg-blue-100 text-blue-700',                   dot: 'bg-blue-500' },
  DELIVERED:         { label: 'Delivered',           color: 'bg-primary/10 text-primary',                  dot: 'bg-primary' },
  CANCELLED:         { label: 'Cancelled',           color: 'bg-error/10 text-error',                      dot: 'bg-error' },
}

// Per-pharmacy-leg progress — Order.status alone sits at PLACED for the entire marketplace
// journey; this is what actually answers "packed / ready for pickup / with a rider / delivered."
const FULFILLMENT_STEPS = ['ACCEPTED', 'PREPARED', 'PACKED', 'AWAITING_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED']
const FULFILLMENT_STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  BROADCASTING:      { label: 'Awaiting Pharmacy', color: 'bg-surface-container text-on-surface-variant', icon: 'wifi_tethering' },
  ACCEPTED:          { label: 'Preparing',         color: 'bg-amber-50 text-amber-600',      icon: 'inventory' },
  PREPARED:          { label: 'Prepared',          color: 'bg-amber-50 text-amber-600',      icon: 'task_alt' },
  PACKED:            { label: 'Packed',            color: 'bg-blue-50 text-blue-600',        icon: 'inventory_2' },
  NO_PHARMACY_FOUND: { label: 'No Pharmacy Found', color: 'bg-error/10 text-error',          icon: 'help' },
  AWAITING_DELIVERY: { label: 'Ready for Pickup',  color: 'bg-blue-50 text-blue-600',        icon: 'hourglass_top' },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery',  color: 'bg-indigo-50 text-indigo-600',    icon: 'sports_motorsports' },
  DELIVERED:         { label: 'Delivered',         color: 'bg-emerald-50 text-emerald-600',  icon: 'check_circle' },
  CANCELLED:         { label: 'Cancelled',         color: 'bg-error/10 text-error',          icon: 'cancel' },
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function FulfillmentStepper({ status }: { status: string }) {
  const stepIndex = FULFILLMENT_STEPS.indexOf(status)
  if (stepIndex === -1) return null
  return (
    <div className="flex items-center gap-1 mt-2">
      {FULFILLMENT_STEPS.map((step) => (
        <div key={step} className={`h-1.5 flex-1 rounded-full ${FULFILLMENT_STEPS.indexOf(step) <= stepIndex ? 'bg-primary' : 'bg-surface-container-high'}`} />
      ))}
    </div>
  )
}

function TrackingPanel({ order, onClose }: { order: any; onClose: () => void }) {
  const [tracking, setTracking] = useState<TrackingFulfillment[] | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    api.get(`/admin/orders/${order.id}/tracking/`).then((r) => setTracking(r.data.data.fulfillments || [])).catch(() => {})
  }, [order.id])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, TRACKING_POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const cfg = STATUS_CFG[order.status] || { label: order.status?.replace(/_/g, ' '), color: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface z-[60] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-on-surface">Live Delivery Tracking</h3>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">#{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">{order.user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">{order.user?.full_name}</p>
                <p className="text-xs text-on-surface-variant">{order.user?.email}</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.color}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>

          {tracking === null ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
          ) : tracking.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">No pharmacy has been assigned to this order yet.</p>
          ) : (
            tracking.map((t) => {
              const fcfg = t.status === 'ACCEPTED' && !t.prescription_ready
                ? { label: 'Awaiting Prescription', color: 'bg-amber-50 text-amber-600', icon: 'pending_actions' }
                : FULFILLMENT_STATUS_CFG[t.status] || { label: t.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
              const outForDelivery = t.status === 'OUT_FOR_DELIVERY' && t.agent && t.agent.lat != null && t.agent.lng != null
              return (
                <div key={t.fulfillment_id} className="bg-surface rounded-2xl border border-outline-variant p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-sm font-bold text-on-surface">{t.pharmacy_name || 'Pharmacy'}</p>
                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${fcfg.color}`}>
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{fcfg.icon}</span>
                      {fcfg.label}
                    </span>
                  </div>
                  <FulfillmentStepper status={t.status} />
                  {outForDelivery && t.agent && (
                    <div className="mt-3 space-y-2">
                      <div className="h-44 rounded-xl overflow-hidden border border-outline-variant">
                        <LiveTrackingMap
                          riderPosition={{ lat: t.agent.lat as number, lng: t.agent.lng as number }}
                          destination={order.shipping_address?.lat != null && order.shipping_address?.lng != null
                            ? { lat: order.shipping_address.lat, lng: order.shipping_address.lng } : null}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2 flex-wrap text-xs">
                        <span className="font-semibold text-on-surface">{t.agent.name} · {t.agent.phone}</span>
                        {t.distance_km != null && t.eta_minutes != null && (
                          <span className="text-on-surface-variant">~{t.distance_km} km · ~{t.eta_minutes} min</span>
                        )}
                      </div>
                    </div>
                  )}
                  {t.status === 'AWAITING_DELIVERY' && (
                    t.assigned_agent_name ? (
                      <p className="mt-2 text-[11px] text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>sports_motorsports</span>
                        {t.assigned_agent_name} is assigned and heading to pick up this order
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] text-blue-600 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
                        Waiting for a nearby rider to accept this delivery
                      </p>
                    )
                  )}
                </div>
              )
            })
          )}

          <Link href={`/admin/orders/${order.id}`} className="block text-center py-2.5 border border-outline-variant rounded-xl text-sm font-semibold text-on-surface hover:border-primary hover:text-primary transition-colors">
            View Full Order Details
          </Link>
        </div>
      </div>
    </>
  )
}

export default function AdminDeliveryPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, limit: 15 }
      if (search) params.search = search
      if (filterStatus) params.status = filterStatus
      const res = await api.get('/admin/orders/', { params })
      const d = res.data.data
      setOrders(d.orders || [])
      setPages(d.pagination?.totalPages || 1)
      setTotal(d.pagination?.total || 0)
    } catch {}
    finally { setLoading(false) }
  }, [page, search, filterStatus])

  useEffect(() => { load() }, [load])

  const counts = {
    broadcasting: orders.filter((o) => o.status === 'BROADCASTING').length,
    withRider: orders.filter((o) => (o.fulfillments || []).some((f: any) => f.status === 'OUT_FOR_DELIVERY')).length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-on-surface-variant">Real per-pharmacy-leg delivery status and live rider tracking, sourced straight from the marketplace matching engine.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',       value: total,                icon: 'local_shipping',       color: 'bg-primary/10 text-primary' },
          { label: 'Finding Pharmacies', value: counts.broadcasting,  icon: 'wifi_tethering',        color: 'bg-amber-50 text-amber-600' },
          { label: 'With a Rider Now',   value: counts.withRider,     icon: 'sports_motorsports',    color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Delivered',          value: counts.delivered,     icon: 'check_circle',          color: 'bg-emerald-50 text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="bg-surface rounded-2xl border border-outline-variant p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{s.icon}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{s.value}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search order ID or customer…"
            className="w-full pl-9 pr-4 py-2.5 border border-outline-variant rounded-xl text-sm bg-surface text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none transition"
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch((e.target as HTMLInputElement).value); setPage(1) } }}
          />
        </div>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
          className="border border-outline-variant rounded-xl text-sm py-2.5 px-3 bg-surface text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none transition min-w-[160px]">
          <option value="">All Statuses</option>
          {STATUSES.slice(1).map((s) => (
            <option key={s} value={s}>{STATUS_CFG[s]?.label || s}</option>
          ))}
        </select>
        <button
          onClick={() => { setSearch(''); setFilterStatus(''); setPage(1); if (searchRef.current) searchRef.current.value = '' }}
          className="p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container transition-colors text-on-surface-variant"
          title="Clear filters"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_list_off</span>
        </button>
      </div>

      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Order ID', 'Customer', 'Order Status', 'Pharmacy Legs', 'Date', 'Track'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-surface-container-low rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>local_shipping</span>
                    <p className="text-sm mt-2">No orders found</p>
                  </td>
                </tr>
              ) : orders.map((order) => {
                const cfg = STATUS_CFG[order.status] || { label: order.status?.replace(/_/g, ' '), color: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' }
                return (
                  <tr key={order.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-on-surface-variant">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-on-surface">{order.user?.full_name}</p>
                      <p className="text-xs text-on-surface-variant">{order.user?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(order.fulfillments || []).length === 0 ? (
                        <span className="text-xs text-on-surface-variant">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {order.fulfillments.map((f: any) => {
                            const fcfg = f.status === 'ACCEPTED' && !f.prescription_ready
                              ? { label: 'Awaiting Prescription', color: 'bg-amber-50 text-amber-600', icon: 'pending_actions' }
                              : FULFILLMENT_STATUS_CFG[f.status] || { label: f.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
                            return (
                              <span key={f.id} title={f.pharmacy_name}
                                className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${fcfg.color}`}>
                                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '11px' }}>{fcfg.icon}</span>
                                {fcfg.label}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(order.placed_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(order)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-xs font-semibold"
                      >
                        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>gps_fixed</span>
                        Track
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-outline-variant flex justify-between items-center flex-wrap gap-3">
          <p className="text-sm text-on-surface-variant">Showing {orders.length} of {total} orders</p>
          {pages > 1 && (
            <div className="flex gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              {[...Array(Math.min(pages, 5))].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-primary text-on-primary' : 'border border-outline-variant hover:bg-surface-container'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <TrackingPanel order={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
