'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Order } from '@/types'

const STEPS = [
  { key: 'PLACED',           label: 'Order Placed',       icon: 'receipt_long',         desc: 'Your order has been placed successfully.' },
  { key: 'CONFIRMED',        label: 'Confirmed',           icon: 'check_circle',         desc: 'Your order has been confirmed by the pharmacy.' },
  { key: 'PROCESSING',       label: 'Processing',          icon: 'inventory_2',          desc: 'Your medicines are being prepared and packed.' },
  { key: 'SHIPPED',          label: 'Shipped',             icon: 'local_shipping',       desc: 'Your order is on its way to the delivery hub.' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery',    icon: 'delivery_truck_speed', desc: 'Your order is out for delivery to your address.' },
  { key: 'DELIVERED',        label: 'Delivered',           icon: 'task_alt',             desc: 'Your order has been delivered. Enjoy!' },
]

const CANCELLED_STEPS = [
  { key: 'PLACED',    label: 'Order Placed',  icon: 'receipt_long', desc: 'Order was placed.' },
  { key: 'CANCELLED', label: 'Cancelled',     icon: 'cancel',       desc: 'Your order was cancelled.' },
]

export default function TrackOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/orders/${id}/`).then((r) => setOrder(r.data.data.order)).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!order) return (
    <div className="text-center py-24">
      <p className="text-on-surface-variant">Order not found.</p>
      <Link href="/orders" className="text-sm text-primary hover:underline mt-2 block">Back to Orders</Link>
    </div>
  )

  const isCancelled = order.status === 'CANCELLED' || order.status === 'RETURNED'
  const steps = isCancelled ? CANCELLED_STEPS : STEPS
  const currentIdx = steps.findIndex((s) => s.key === order.status)
  const isDelivered = order.status === 'DELIVERED'

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

      {/* Tracking timeline */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-6">
        <h2 className="text-sm font-bold text-on-surface mb-6">Tracking Timeline</h2>
        <div className="space-y-0">
          {steps.map((step, i) => {
            const done = i <= currentIdx
            const active = i === currentIdx
            const isLast = i === steps.length - 1
            return (
              <div key={step.key} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    done
                      ? isCancelled && active ? 'bg-error text-white' : 'bg-primary text-on-primary'
                      : 'bg-surface-container border-2 border-outline-variant text-on-surface-variant'
                  }`}>
                    {done && !active
                      ? <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>check</span>
                      : <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{step.icon}</span>
                    }
                  </div>
                  {!isLast && (
                    <div className={`w-0.5 flex-1 min-h-[32px] mt-1 mb-1 ${i < currentIdx ? 'bg-primary' : 'bg-outline-variant'}`} />
                  )}
                </div>
                <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                  <p className={`text-sm font-bold ${active ? (isCancelled ? 'text-error' : 'text-primary') : done ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {step.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${active ? 'text-on-surface-variant' : done ? 'text-on-surface-variant' : 'text-outline'}`}>
                    {active ? step.desc : done ? step.desc : 'Pending'}
                  </p>
                  {active && !isCancelled && !isDelivered && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      Current Status
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Delivery address */}
      {order.shipping_address && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Delivery Address</p>
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined ms-filled text-secondary mt-0.5" style={{ fontSize: '18px' }}>location_on</span>
            <div className="text-sm text-on-surface-variant space-y-0.5">
              <p className="font-medium text-on-surface">{(order.shipping_address as any).full_name || (order.shipping_address as any).name}</p>
              <p>{(order.shipping_address as any).address_line1 || (order.shipping_address as any).address}</p>
              <p>{(order.shipping_address as any).city}, {(order.shipping_address as any).state || (order.shipping_address as any).province}</p>
              <p>{(order.shipping_address as any).phone}</p>
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
