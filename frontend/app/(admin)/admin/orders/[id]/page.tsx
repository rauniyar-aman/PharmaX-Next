'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { AdminOrderDetail, TrackingFulfillment } from '@/types'

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

const STATUS_COLORS: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'bg-amber-50 text-amber-600',
  PRESCRIPTION_REJECTED: 'bg-error/10 text-error',
  BROADCASTING: 'bg-surface-container text-on-surface-variant',
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-600',
  NO_PHARMACY_FOUND: 'bg-error/10 text-error',
  PLACED: 'bg-blue-50 text-blue-600',
  DELIVERED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

// Same per-fulfillment progression as the customer tracking page and the pharmacy dashboard —
// Order.status alone doesn't capture "packed / ready for pickup / with rider" for any given leg.
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

const REQUEST_STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:  { label: 'Awaiting Response', color: 'bg-blue-50 text-blue-600',       icon: 'hourglass_top' },
  ACCEPTED: { label: 'Accepted',          color: 'bg-emerald-50 text-emerald-600', icon: 'check_circle' },
  DECLINED: { label: 'Declined',          color: 'bg-error/10 text-error',         icon: 'thumb_down' },
  EXPIRED:  { label: 'Ignored (Expired)', color: 'bg-surface-container text-on-surface-variant', icon: 'schedule' },
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

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [tracking, setTracking] = useState<TrackingFulfillment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get(`/admin/orders/${id}/`).then((r) => setOrder(r.data.data.order))
      .catch(() => toast.error('Failed to load order.')).finally(() => setLoading(false))
  }, [id])

  const loadTracking = useCallback(() => {
    api.get(`/admin/orders/${id}/tracking/`).then((r) => {
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
      <Link href="/admin/orders" className="text-sm text-primary hover:underline mt-2 block">Back to Orders</Link>
    </div>
  )

  const destination = order.shipping_address?.lat != null && order.shipping_address?.lng != null
    ? { lat: order.shipping_address.lat, lng: order.shipping_address.lng }
    : null

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/orders" className="hover:text-primary transition-colors">Orders</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">#{order.id.slice(0, 8).toUpperCase()}</span>
      </div>

      {/* Header */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-on-surface-variant">Order placed on</p>
          <p className="text-sm font-semibold text-on-surface">{new Date(order.placed_at).toLocaleString('en-NP', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Customer */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <p className="text-sm font-bold text-on-surface mb-2">Customer</p>
        <div className="text-sm text-on-surface-variant space-y-0.5">
          <p className="font-medium text-on-surface">{order.customer.full_name}</p>
          <p>{order.customer.email}</p>
          {order.customer.phone && <p>{order.customer.phone}</p>}
        </div>
      </div>

      {/* Per-fulfillment progress + live map */}
      {!!tracking?.length && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-on-surface">Fulfillment Progress</p>
          {tracking.map((t) => {
            const cfg = FULFILLMENT_STATUS_CFG[t.status] || { label: t.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
            const progress = order.fulfillments.find((f) => f.id === t.fulfillment_id)
            const outForDelivery = t.status === 'OUT_FOR_DELIVERY' && t.agent && t.agent.lat != null && t.agent.lng != null

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

                {outForDelivery && t.agent && (
                  <div className="mt-4 space-y-3">
                    <div className="h-64 rounded-xl overflow-hidden border border-outline-variant">
                      <LiveTrackingMap
                        riderPosition={{ lat: t.agent.lat as number, lng: t.agent.lng as number }}
                        destination={destination}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '20px' }}>sports_motorsports</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{t.agent.name}</p>
                          <p className="text-xs text-on-surface-variant">{t.agent.phone}</p>
                        </div>
                      </div>
                      {t.distance_km != null && t.eta_minutes != null && (
                        <p className="text-xs font-medium text-on-surface-variant text-right">
                          ~{t.distance_km} km to destination
                          <br />
                          <span className="text-primary font-semibold">~{t.eta_minutes} min</span> (estimate)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pharmacies asked — full audit trail, not just who won */}
      {!!order.fulfillment_requests?.length && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface mb-1">Pharmacies Asked</p>
          {order.fulfillment_requests.map((r) => {
            const cfg = REQUEST_STATUS_CFG[r.status] || { label: r.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{r.pharmacy_name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {r.medicine_name} × {r.quantity}
                    {r.responded_at ? ` · Responded ${new Date(r.responded_at).toLocaleString()}` : ` · Asked ${new Date(r.created_at).toLocaleString()}`}
                  </p>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Delivery address */}
      {order.shipping_address && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Delivery Address</p>
          <div className="text-sm text-on-surface-variant space-y-0.5">
            <p className="font-medium text-on-surface">{order.shipping_address.full_name}</p>
            <p>{order.shipping_address.address_line1}</p>
            <p>{order.shipping_address.city}, {order.shipping_address.state}</p>
            <p>{order.shipping_address.phone}</p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Items Ordered</p>
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            {item.medicine.image_url ? (
              <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>medication</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">{item.medicine.name}</p>
              <p className="text-xs text-on-surface-variant">Qty: {item.quantity} × NPR {Number(item.unit_price).toFixed(0)}</p>
            </div>
            <p className="text-sm font-bold text-on-surface">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</p>
          </div>
        ))}
      </div>

      {/* Payment summary */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-1.5 text-sm">
        <p className="text-sm font-bold text-on-surface mb-1">Payment</p>
        <div className="flex justify-between text-on-surface-variant">
          <span>Method</span>
          <span className="text-on-surface capitalize">{order.payment_method ? order.payment_method.replace(/_/g, ' ') : 'Not selected yet'}</span>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>Status</span>
          <span className={`font-medium capitalize ${order.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.payment_status}</span>
        </div>
        <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-1.5 mt-1">
          <span>Total</span>
          <span>NPR {Number(order.total_amount).toFixed(0)}</span>
        </div>
      </div>
    </div>
  )
}
