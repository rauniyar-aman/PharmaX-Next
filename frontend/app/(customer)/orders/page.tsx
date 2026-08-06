'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Order } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-blue-50 text-blue-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  PROCESSING: 'bg-amber-50 text-amber-600',
  SHIPPED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
  RETURNED: 'bg-error/10 text-error',
}

const STATUS_ICONS: Record<string, string> = {
  PLACED: 'receipt_long',
  CONFIRMED: 'check_circle',
  PROCESSING: 'inventory_2',
  SHIPPED: 'local_shipping',
  OUT_FOR_DELIVERY: 'delivery_truck_speed',
  DELIVERED: 'task_alt',
  CANCELLED: 'cancel',
  RETURNED: 'keyboard_return',
}

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/orders/').then((r) => setOrders(r.data.data.orders || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!orders.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>package_2</span>
      <h2 className="text-xl font-bold text-on-surface">No orders yet</h2>
      <p className="text-sm text-on-surface-variant">Your placed orders will appear here</p>
      <Link href="/medicines" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Browse Medicines
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">My Orders</h1>
        <span className="text-sm text-on-surface-variant">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-3">
        {orders.map((order) => (
          <Link key={order.id} href={`/orders/${order.id}`}
            className="block bg-surface rounded-2xl border border-outline-variant p-5 hover:border-primary/30 hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs text-on-surface-variant">Order ID</p>
                <p className="text-xs font-mono font-medium text-on-surface">#{order.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-sm font-semibold text-on-surface mt-2">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {new Date(order.placed_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right space-y-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>{STATUS_ICONS[order.status] || 'circle'}</span>
                  {order.status.replace(/_/g, ' ')}
                </span>
                <p className="text-lg font-bold text-on-surface">NPR {Number(order.total_amount).toFixed(0)}</p>
                <p className="text-xs text-on-surface-variant capitalize">{order.payment_method?.replace(/_/g, ' ')} · {order.payment_status}</p>
              </div>
            </div>
            {order.items.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant">
                {order.items.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5 bg-surface-container-low rounded-lg px-2 py-1">
                    {item.medicine.image_url ? (
                      <img src={item.medicine.image_url} alt={item.medicine.name} className="w-6 h-6 rounded object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>medication</span>
                    )}
                    <span className="text-xs text-on-surface-variant">{item.medicine.name}</span>
                    <span className="text-xs text-on-surface-variant">×{item.quantity}</span>
                  </div>
                ))}
                {order.items.length > 4 && (
                  <span className="text-xs text-on-surface-variant self-center">+{order.items.length - 4} more</span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
