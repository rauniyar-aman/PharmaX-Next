'use client'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import type { Order } from '@/types'

function OrderConfirmedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [support, setSupport] = useState<{ support_email?: string | null; support_phone?: string | null } | null>(null)

  useEffect(() => {
    const orderId = searchParams.get('orderId') || sessionStorage.getItem('lastOrderId')
    if (!orderId) { router.replace('/orders'); return }
    api.get(`/orders/${orderId}/`).then((r) => setOrder(r.data.data.order)).catch(() => {}).finally(() => {
      setLoading(false)
      sessionStorage.removeItem('lastOrderId')
    })
    api.get('/settings/').then((r) => setSupport(r.data.data)).catch(() => {})
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '48px' }}>check_circle</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Order Placed!</h1>
        <p className="text-sm text-on-surface-variant mt-2">Thank you for your order. We'll send you updates as your order progresses.</p>
      </div>
      {order && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Order ID</span>
            <span className="font-mono font-medium text-on-surface">#{order.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Items</span>
            <span className="text-on-surface font-medium">{order.items.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Total</span>
            <span className="text-on-surface font-bold">NPR {Number(order.total_amount).toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Payment</span>
            <span className="text-on-surface capitalize">{order.payment_method?.replace(/_/g, ' ')}</span>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {order && (
          <Link href={`/orders/${order.id}`}
            className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
            Track My Order
          </Link>
        )}
        <Link href="/medicines"
          className="w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          Continue Shopping
        </Link>
      </div>
      {(support?.support_email || support?.support_phone) && (
        <p className="text-xs text-on-surface-variant">
          Questions about your order?{' '}
          {support.support_email && <a href={`mailto:${support.support_email}`} className="text-secondary hover:underline">{support.support_email}</a>}
          {support.support_email && support.support_phone && ' · '}
          {support.support_phone && <a href={`tel:${support.support_phone}`} className="text-secondary hover:underline">{support.support_phone}</a>}
        </p>
      )}
    </div>
  )
}

export default function OrderConfirmedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <OrderConfirmedContent />
    </Suspense>
  )
}
