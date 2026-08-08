'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyOrderFulfillment } from '@/types'

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  ACCEPTED:          { label: 'Preparing',        color: 'bg-amber-50 text-amber-600' },
  AWAITING_DELIVERY: { label: 'Awaiting Rider',    color: 'bg-blue-50 text-blue-600' },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery',  color: 'bg-indigo-50 text-indigo-600' },
  DELIVERED:         { label: 'Delivered',         color: 'bg-emerald-50 text-emerald-600' },
  CANCELLED:         { label: 'Cancelled',         color: 'bg-error/10 text-error' },
  NO_PHARMACY_FOUND: { label: 'No Pharmacy Found', color: 'bg-surface-container text-on-surface-variant' },
  BROADCASTING:      { label: 'Broadcasting',      color: 'bg-surface-container text-on-surface-variant' },
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PharmacyOrdersPage() {
  const [orders, setOrders] = useState<PharmacyOrderFulfillment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/pharmacy/orders/').then((r) => setOrders(r.data.data.orders || [])).catch(() => toast.error('Failed to load orders.')).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Order History</h1>
        <p className="text-sm text-on-surface-variant mt-1">Items you've accepted, and their delivery status.</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>receipt_long</span>
          <p className="mt-2 text-sm">No orders yet — accepted requests will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const cfg = STATUS_CFG[o.status] || { label: o.status, color: 'bg-surface-container text-on-surface-variant' }
            return (
              <div key={o.id} className="bg-surface rounded-2xl border border-outline-variant p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-mono text-on-surface-variant">#{o.order_id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Placed {fmtDate(o.order_placed_at)} · {o.city || 'Unknown area'}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="mt-3 divide-y divide-outline-variant border-t border-outline-variant">
                  {o.items.map((item) => (
                    <div key={item.medicine_id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-on-surface">{item.medicine_name} <span className="text-on-surface-variant">× {item.quantity}</span></span>
                      <span className="text-on-surface-variant">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
                {o.delivery_agent_name && (
                  <p className="mt-2 text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>sports_motorsports</span>
                    Rider: {o.delivery_agent_name}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
