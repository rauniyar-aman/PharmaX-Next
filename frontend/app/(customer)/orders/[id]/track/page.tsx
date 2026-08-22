'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Order, TrackingFulfillment } from '@/types'

const LiveTrackingMap = dynamic(() => import('@/components/map/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

const POLL_INTERVAL_MS = 10000
const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED']

// A split order across multiple pharmacies has independent progress per fulfillment — there is
// no single order-level "Processing/Shipped/Out for Delivery" (those Order.status choices exist
// in the model but sync_order_status() never actually sets them; OUT_FOR_DELIVERY in particular
// is only ever a per-fulfillment status). This mirrors the same config already used on the order
// detail page's "Pharmacy Progress" section and the pharmacy dashboard's own status badges.
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

export default function TrackOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [tracking, setTracking] = useState<TrackingFulfillment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get(`/orders/${id}/`).then((r) => setOrder(r.data.data.order)).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const loadTracking = useCallback(() => {
    api.get(`/orders/${id}/tracking/`).then((r) => {
      const fulfillments: TrackingFulfillment[] = r.data.data.fulfillments || []
      setTracking(fulfillments)
      const allTerminal = fulfillments.length > 0 && fulfillments.every((f) => TERMINAL_STATUSES.includes(f.status))
      if (allTerminal && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }).catch(() => {})
  }, [id])

  useEffect(() => {
    loadTracking()
    pollRef.current = setInterval(loadTracking, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadTracking])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!order) return (
    <div className="text-center py-24">
      <p className="text-on-surface-variant">Order not found.</p>
      <Link href="/orders" className="text-sm text-primary hover:underline mt-2 block">Back to Orders</Link>
    </div>
  )

  const isCancelled = order.status === 'CANCELLED' || order.status === 'RETURNED'
  const isDelivered = order.status === 'DELIVERED'
  const destination = order.shipping_address?.lat != null && order.shipping_address?.lng != null
    ? { lat: order.shipping_address.lat, lng: order.shipping_address.lng }
    : null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/orders" className="hover:text-primary transition-colors">Orders</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <Link href={`/orders/${id}`} className="hover:text-primary transition-colors">#{id.slice(0, 8).toUpperCase()}</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Track</span>
      </div>

      {/* Header card */}
      <div className={`rounded-2xl p-6 text-white ${isDelivered ? 'bg-gradient-to-r from-primary to-primary/80' : isCancelled ? 'bg-gradient-to-r from-error to-error/80' : 'bg-gradient-to-r from-secondary to-secondary/80'}`}>
        <p className="text-sm font-medium opacity-80">Order #{id.slice(0, 8).toUpperCase()}</p>
        <h1 className="text-2xl font-bold mt-1">
          {isDelivered ? 'Delivered!' : isCancelled ? 'Order Cancelled' : 'Order in Progress'}
        </h1>
        <p className="text-sm opacity-70 mt-1">
          {isDelivered
            ? `Delivered on ${new Date(order.updated_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : isCancelled
            ? 'This order has been cancelled.'
            : 'We\'ll keep you updated as your order moves forward.'}
        </p>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs opacity-70">Placed on</p>
            <p className="text-sm font-semibold">{new Date(order.placed_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div>
            <p className="text-xs opacity-70">Total</p>
            <p className="text-sm font-semibold">NPR {Number(order.total_amount).toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs opacity-70">Items</p>
            <p className="text-sm font-semibold">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Per-fulfillment progress — one card per pharmacy leg, since a split order has an
          independent status (and independent rider, once out for delivery) per pharmacy. */}
      {!isCancelled && !!tracking?.length && (
        <div className="space-y-3">
          {tracking.map((t) => {
            const cfg = t.status === 'ACCEPTED' && !t.prescription_ready
              ? { label: 'Awaiting Prescription', color: 'bg-amber-50 text-amber-600', icon: 'pending_actions' }
              : FULFILLMENT_STATUS_CFG[t.status] || { label: t.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
            const progress = order.fulfillments?.find((f) => f.id === t.fulfillment_id)
            const hasAgentLocation = !!t.agent && t.agent.lat != null && t.agent.lng != null

            return (
              <div key={t.fulfillment_id} className="bg-surface rounded-2xl border border-outline-variant p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">{t.pharmacy_name || 'Pharmacy'}</p>
                    {progress && (
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">
                        {progress.items.map((i) => `${i.medicine_name} × ${i.quantity}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                </div>

                <FulfillmentStepper status={t.status} />

                {/* Rider card shows as soon as one is assigned to this leg — not just once
                    OUT_FOR_DELIVERY — so the customer can see and reach whoever is already
                    committed to the pickup. The live map only renders once the rider actually has
                    coordinates to plot. */}
                {t.agent && (
                  <div className="mt-4 space-y-3">
                    {hasAgentLocation && (
                      <div className="h-56 rounded-xl overflow-hidden border border-outline-variant">
                        <LiveTrackingMap
                          riderPosition={{ lat: t.agent.lat as number, lng: t.agent.lng as number }}
                          destination={destination}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '20px' }}>sports_motorsports</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{t.agent.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={`tel:${t.agent.phone}`} className="text-xs text-primary hover:underline">{t.agent.phone}</a>
                            {t.agent.rating != null && (
                              <span className="flex items-center gap-0.5 text-xs text-on-surface-variant">
                                <span className="material-symbols-outlined ms-filled text-amber-400" style={{ fontSize: '13px' }}>star</span>
                                {t.agent.rating} <span className="text-on-surface-variant/70">({t.agent.rating_count})</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {t.distance_km != null && t.eta_minutes != null && (
                        <p className="text-xs font-medium text-on-surface-variant text-right">
                          ~{t.distance_km} km away
                          <br />
                          <span className="text-primary font-semibold">~{t.eta_minutes} min</span> (estimate)
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {t.status === 'AWAITING_DELIVERY' && !t.agent && (
                  <p className="mt-3 text-[11px] text-blue-600 flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
                    Waiting for a nearby rider to accept this delivery
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delivery address */}
      {order.shipping_address && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Delivery Address</p>
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined ms-filled text-secondary mt-0.5" style={{ fontSize: '18px' }}>location_on</span>
            <div className="text-sm text-on-surface-variant space-y-0.5">
              <p className="font-medium text-on-surface">{order.shipping_address.full_name}</p>
              <p>{order.shipping_address.address_line1}</p>
              <p>{order.shipping_address.city}, {order.shipping_address.state}</p>
              <p>{order.shipping_address.phone}</p>
            </div>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Items in This Order</p>
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.medicine.image_url ? (
              <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>medication</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{item.medicine.name}</p>
              <p className="text-xs text-on-surface-variant">Qty: {item.quantity}</p>
            </div>
            <p className="text-sm font-bold text-on-surface">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link href={`/orders/${id}`} className="flex-1 py-3 border border-outline-variant rounded-2xl text-sm font-semibold text-on-surface text-center hover:border-primary hover:text-primary transition-colors">
          Order Details
        </Link>
        <Link href="/medicines" className="flex-1 py-3 bg-primary text-on-primary rounded-2xl text-sm font-semibold text-center hover:opacity-90 transition-opacity">
          Continue Shopping
        </Link>
      </div>
    </div>
  )
}
