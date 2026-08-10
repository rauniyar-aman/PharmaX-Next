'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyOrderFulfillment, TrackingFulfillment } from '@/types'

const LiveTrackingMap = dynamic(() => import('@/components/map/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

const TRACKING_POLL_INTERVAL_MS = 10000

const STATUS_STEPS = ['ACCEPTED', 'PREPARED', 'PACKED', 'AWAITING_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED']

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  ACCEPTED:          { label: 'Preparing',        color: 'bg-amber-50 text-amber-600',      icon: 'inventory' },
  PREPARED:          { label: 'Prepared',         color: 'bg-amber-50 text-amber-600',      icon: 'task_alt' },
  PACKED:            { label: 'Packed',           color: 'bg-blue-50 text-blue-600',        icon: 'inventory_2' },
  AWAITING_DELIVERY: { label: 'Ready for Pickup',  color: 'bg-blue-50 text-blue-600',        icon: 'hourglass_top' },
  OUT_FOR_DELIVERY:  { label: 'With Rider',        color: 'bg-indigo-50 text-indigo-600',    icon: 'sports_motorsports' },
  DELIVERED:         { label: 'Delivered',         color: 'bg-emerald-50 text-emerald-600',  icon: 'check_circle' },
  CANCELLED:         { label: 'Cancelled',         color: 'bg-error/10 text-error',          icon: 'cancel' },
  NO_PHARMACY_FOUND: { label: 'No Pharmacy Found', color: 'bg-surface-container text-on-surface-variant', icon: 'help' },
  BROADCASTING:      { label: 'Broadcasting',      color: 'bg-surface-container text-on-surface-variant', icon: 'wifi_tethering' },
}

// What each prep-stage button says, keyed by the fulfillment's CURRENT status — clicking it asks
// the backend to advance one step (ACCEPTED -> PREPARED -> PACKED -> AWAITING_DELIVERY). See
// pharmacy_advance_fulfillment() on the backend for the actual sequencing/validation.
const ADVANCE_ACTION: Record<string, string> = {
  ACCEPTED: 'Mark as Prepared',
  PREPARED: 'Mark as Packed',
  PACKED: 'Ready for Pickup',
}

const PAYMENT_CFG: Record<string, { label: string; color: string; icon: string }> = {
  PAID:    { label: 'Paid',            color: 'bg-emerald-50 text-emerald-600', icon: 'paid' },
  PENDING: { label: 'Payment Pending', color: 'bg-amber-50 text-amber-600',     icon: 'pending' },
  HIDDEN:  { label: 'Finance Hidden',  color: 'bg-surface-container text-on-surface-variant', icon: 'visibility_off' },
}

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'In Progress' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'PAYMENT_PENDING', label: 'Payment Pending' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Small horizontal progress stepper for the normal happy-path statuses — gives an at-a-glance
 * read of "what's happening with this order" beyond a single status word. Cancelled / no-pharmacy
 * / broadcasting fall outside this linear path, so they render as a plain badge instead. */
function StatusStepper({ status }: { status: string }) {
  const stepIndex = STATUS_STEPS.indexOf(status)
  if (stepIndex === -1) return null
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {STATUS_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1.5 flex-1">
          <div className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-surface-container-high'}`} />
        </div>
      ))}
    </div>
  )
}

export default function PharmacyOrdersPage() {
  const [orders, setOrders] = useState<PharmacyOrderFulfillment[]>([])
  const [showFinance, setShowFinance] = useState(true)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [trackingByFulfillmentId, setTrackingByFulfillmentId] = useState<Record<string, TrackingFulfillment>>({})
  const [mapExpandedId, setMapExpandedId] = useState<string | null>(null)
  const trackingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get('/pharmacy/orders/').then((r) => {
      setOrders(r.data.data.orders || [])
      setShowFinance(r.data.data.show_finance !== false)
    }).catch(() => toast.error('Failed to load orders.')).finally(() => setLoading(false))
  }, [])

  // Once handed to a rider, a simple "rider + distance" line is enough here — the pharmacy's job
  // is done at that point, unlike the customer's full live map. Polls orders currently
  // AWAITING_DELIVERY (waiting for ANY rider to accept) or OUT_FOR_DELIVERY (waiting for the
  // assigned rider to deliver) — both are stages an external actor (a rider, not this pharmacy)
  // can advance without this page doing anything. The poll response's `status` is merged back
  // into `orders` itself, not just stashed in a side map — otherwise the primary badge/stepper
  // stays frozen on whatever it was at page load (e.g. still "Ready for Pickup" after a rider
  // already accepted, or still "With Rider" after they've delivered), since ADVANCE_ACTION never
  // changes it once the pharmacy is out of the loop.
  const loadTracking = useCallback(() => {
    const orderIds = Array.from(new Set(
      orders.filter((o) => o.status === 'AWAITING_DELIVERY' || o.status === 'OUT_FOR_DELIVERY').map((o) => o.order_id)
    ))
    if (orderIds.length === 0) return
    Promise.all(orderIds.map((orderId) =>
      api.get(`/pharmacy/orders/${orderId}/tracking/`).then((r) => (r.data.data.fulfillments || []) as TrackingFulfillment[]).catch(() => [] as TrackingFulfillment[])
    )).then((results) => {
      const map: Record<string, TrackingFulfillment> = {}
      results.flat().forEach((f) => { map[f.fulfillment_id] = f })
      setTrackingByFulfillmentId(map)
      setOrders((prev) => prev.map((o) => (map[o.id] && map[o.id].status !== o.status ? { ...o, status: map[o.id].status } : o)))
    })
  }, [orders])

  useEffect(() => {
    loadTracking()
    trackingPollRef.current = setInterval(loadTracking, TRACKING_POLL_INTERVAL_MS)
    return () => { if (trackingPollRef.current) clearInterval(trackingPollRef.current) }
  }, [loadTracking])

  const advanceStatus = async (id: string) => {
    setAdvancingId(id)
    try {
      const res = await api.post(`/pharmacy/orders/${id}/advance/`)
      setOrders((prev) => prev.map((o) => (o.id === id ? res.data.data.order : o)))
      toast.success('Status updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not update status.')
    } finally {
      setAdvancingId(null)
    }
  }

  const filtered = useMemo(() => {
    switch (filter) {
      case 'ACTIVE': return orders.filter((o) => STATUS_STEPS.slice(0, -1).includes(o.status))
      case 'DELIVERED': return orders.filter((o) => o.status === 'DELIVERED')
      case 'PAYMENT_PENDING': return orders.filter((o) => o.payment_status === 'PENDING')
      default: return orders
    }
  }, [orders, filter])

  const pendingPayoutTotal = useMemo(
    () => orders.filter((o) => o.payment_status === 'PENDING').reduce((sum, o) => sum + Number(o.payout_amount || 0), 0),
    [orders],
  )

  const visibleFilters = showFinance ? FILTERS : FILTERS.filter((f) => f.key !== 'PAYMENT_PENDING')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Order History</h1>
        <p className="text-sm text-on-surface-variant mt-1">Items you've accepted, their delivery status, and what you're owed.</p>
      </div>

      {!loading && showFinance && pendingPayoutTotal > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-amber-600" style={{ fontSize: '22px' }}>account_balance_wallet</span>
          <p className="text-sm text-amber-800">
            <span className="font-bold">NPR {pendingPayoutTotal.toFixed(0)}</span> across delivered orders is still awaiting payout from PharmaX.
          </p>
        </div>
      )}

      {!loading && !showFinance && (
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>visibility_off</span>
          <p className="text-xs text-on-surface-variant">Income and payout figures are hidden from your account. Ask the pharmacy owner for access.</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {visibleFilters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filter === f.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>receipt_long</span>
          <p className="mt-2 text-sm">{orders.length === 0 ? "No orders yet — accepted requests will show up here." : 'No orders match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            // A fulfillment sits in ACCEPTED/PREPARED/PACKED the instant a pharmacy accepts a
            // request — well before the customer has actually paid or chosen COD. The prep-stage
            // labels ("Preparing", "Prepared", "Packed") would be misleading during that window
            // since the pharmacy is blocked from acting on it (see pharmacy_advance_fulfillment()
            // on the backend), so show "Awaiting Payment" instead until order_status is PLACED.
            const awaitingPayment = !!ADVANCE_ACTION[o.status] && o.order_status !== 'PLACED'
            const cfg = awaitingPayment
              ? { label: 'Awaiting Payment', color: 'bg-amber-50 text-amber-600', icon: 'hourglass_top' }
              : STATUS_CFG[o.status] || { label: o.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
            const payCfg = PAYMENT_CFG[o.payment_status]
            return (
              <div key={o.id} className="bg-surface rounded-2xl border border-outline-variant p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-mono text-on-surface-variant">#{o.order_id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Placed {fmtDate(o.order_placed_at)} · {o.city || 'Unknown area'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {payCfg && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${payCfg.color}`}>{payCfg.label}</span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                      {cfg.label}
                    </span>
                  </div>
                </div>

                <StatusStepper status={o.status} />

                <div className="mt-3 divide-y divide-outline-variant border-t border-outline-variant">
                  {o.items.map((item) => (
                    <div key={item.medicine_id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-on-surface">{item.medicine_name} <span className="text-on-surface-variant">× {item.quantity}</span></span>
                      <span className="text-on-surface-variant">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>

                {ADVANCE_ACTION[o.status] ? (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button onClick={() => advanceStatus(o.id)} disabled={advancingId === o.id || awaitingPayment}
                      className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50">
                      {advancingId === o.id ? 'Updating…' : ADVANCE_ACTION[o.status]}
                    </button>
                    {awaitingPayment && (
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
                        Waiting for the customer's payment to be confirmed
                      </p>
                    )}
                  </div>
                ) : o.status === 'AWAITING_DELIVERY' && !o.delivery_agent_name && (
                  <p className="mt-2 text-[11px] text-blue-600 flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
                    Waiting for a nearby rider to accept this delivery
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                  {o.delivery_agent_name ? (
                    <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>sports_motorsports</span>
                      Rider: {o.delivery_agent_name}
                      {o.status === 'OUT_FOR_DELIVERY' && trackingByFulfillmentId[o.id]?.distance_km != null && (
                        <span className="text-on-surface-variant"> · ~{trackingByFulfillmentId[o.id].distance_km} km from the delivery address</span>
                      )}
                      {o.status === 'OUT_FOR_DELIVERY' && trackingByFulfillmentId[o.id]?.agent?.lat != null && (
                        <button onClick={() => setMapExpandedId(mapExpandedId === o.id ? null : o.id)}
                          className="ml-1 text-primary font-semibold hover:underline">
                          {mapExpandedId === o.id ? 'Hide map' : 'Track on map'}
                        </button>
                      )}
                    </p>
                  ) : <span />}

                  {o.payment_status === 'PAID' && o.payout_amount && (
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '15px' }}>paid</span>
                      NPR {Number(o.payout_amount).toFixed(0)} paid {o.payout_paid_at ? `on ${fmtDate(o.payout_paid_at)}` : ''}
                    </p>
                  )}
                  {o.payment_status === 'PENDING' && o.payout_amount && (
                    <p className="text-xs text-amber-600 font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>pending</span>
                      NPR {Number(o.payout_amount).toFixed(0)} owed — pending payout
                    </p>
                  )}
                </div>

                {mapExpandedId === o.id && o.status === 'OUT_FOR_DELIVERY' && trackingByFulfillmentId[o.id]?.agent?.lat != null && (
                  <div className="mt-2 h-52 rounded-xl overflow-hidden border border-outline-variant">
                    <LiveTrackingMap
                      riderPosition={{ lat: trackingByFulfillmentId[o.id].agent!.lat as number, lng: trackingByFulfillmentId[o.id].agent!.lng as number }}
                      destination={o.destination_lat != null && o.destination_lng != null ? { lat: o.destination_lat, lng: o.destination_lng } : null}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
