'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Order } from '@/types'

const STEPS = ['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']

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

interface MedRating { rating: number; comment: string; existing: boolean }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [orderRating, setOrderRating] = useState(0)
  const [orderComment, setOrderComment] = useState('')
  const [ratingLoading, setRatingLoading] = useState(false)
  const [medRatings, setMedRatings] = useState<Record<string, MedRating>>({})
  const [medSubmitting, setMedSubmitting] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/orders/${id}/`).then(async (r) => {
      const o: Order = r.data.data.order
      setOrder(o)
      if (o.order_rating) { setOrderRating(o.order_rating); setOrderComment(o.order_comment || '') }

      if (o.status === 'DELIVERED') {
        const entries = await Promise.all(o.items.map(async (item) => {
          try {
            const rr = await api.get(`/medicines/${item.medicine.id}/reviews/`)
            const mine = (rr.data.data.reviews || []).find((rev: any) => rev.is_mine || rev.mine)
            return [item.medicine.id, mine ? { rating: mine.rating, comment: mine.comment || '', existing: true } : { rating: 0, comment: '', existing: false }] as const
          } catch {
            return [item.medicine.id, { rating: 0, comment: '', existing: false }] as const
          }
        }))
        setMedRatings(Object.fromEntries(entries))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const handleCancel = async () => {
    if (!order || !confirm('Are you sure you want to cancel this order?')) return
    setCancelling(true)
    try {
      await api.put(`/orders/${order.id}/cancel/`)
      setOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev))
      toast.success('Order cancelled.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not cancel order.')
    } finally {
      setCancelling(false)
    }
  }

  const handleRateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!order || !orderRating) return
    setRatingLoading(true)
    try {
      await api.put(`/orders/${order.id}/rate/`, { order_rating: orderRating, order_comment: orderComment })
      toast.success('Thanks for your feedback!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not submit rating.')
    } finally {
      setRatingLoading(false)
    }
  }

  const handleRateMedicine = async (medicineId: string) => {
    const r = medRatings[medicineId]
    if (!r || !r.rating) return
    setMedSubmitting(medicineId)
    try {
      const method = r.existing ? 'put' : 'post'
      await api[method](`/medicines/${medicineId}/reviews/`, { rating: r.rating, comment: r.comment })
      setMedRatings((p) => ({ ...p, [medicineId]: { ...p[medicineId], existing: true } }))
      toast.success('Review saved!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save review.')
    } finally {
      setMedSubmitting(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!order) return <div className="text-center py-24"><p className="text-base text-on-surface">Order not found.</p><Link href="/orders" className="text-sm text-primary hover:underline mt-2 block">Back to Orders</Link></div>

  const currentStep = STEPS.indexOf(order.status)
  const isCancelled = order.status === 'CANCELLED' || order.status === 'RETURNED'
  const canCancel = ['PLACED', 'CONFIRMED'].includes(order.status)
  const isDelivered = order.status === 'DELIVERED'

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/orders" className="hover:text-primary transition-colors">Orders</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">#{order.id.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-on-surface-variant">Order placed on</p>
          <p className="text-sm font-semibold text-on-surface">{new Date(order.placed_at).toLocaleString('en-NP', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
            {order.status.replace(/_/g, ' ')}
          </span>
          {canCancel && (
            <button onClick={handleCancel} disabled={cancelling}
              className="px-4 py-1.5 border border-error/30 text-error text-sm font-semibold rounded-full hover:bg-error/10 transition-colors disabled:opacity-60 flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>cancel</span>
              {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
        </div>
      </div>

      {!isCancelled && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5">
          <p className="text-sm font-bold text-on-surface mb-5">Order Tracking</p>
          <div className="flex items-center">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i <= currentStep ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'}`}>
                    {i < currentStep ? (
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '16px' }}>check</span>
                    ) : i === currentStep ? (
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '16px' }}>radio_button_checked</span>
                    ) : (
                      <span className="text-xs">{i + 1}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-center text-on-surface-variant mt-1.5 max-w-[60px] leading-tight">{step.replace(/_/g, ' ')}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < currentStep ? 'bg-primary' : 'bg-outline-variant'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Items Ordered</p>
        {order.items.map((item) => {
          const mr = medRatings[item.medicine.id]
          return (
            <div key={item.id} className="py-2 border-b border-outline-variant last:border-0 space-y-2">
              <div className="flex gap-3 items-center">
                {item.medicine.image_url ? (
                  <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '24px' }}>medication</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{item.medicine.name}</p>
                  <p className="text-xs text-on-surface-variant">{item.medicine.brand_name}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Qty: {item.quantity} × NPR {Number(item.unit_price).toFixed(0)}</p>
                </div>
                <p className="text-sm font-bold text-on-surface">NPR {(item.quantity * Number(item.unit_price)).toFixed(0)}</p>
              </div>
              {isDelivered && mr && (
                <div className="flex items-center gap-2 pl-[68px]">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button"
                        onClick={() => setMedRatings((p) => ({ ...p, [item.medicine.id]: { ...p[item.medicine.id], rating: n } }))}>
                        <span className={`material-symbols-outlined ${n <= mr.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '18px' }}>star</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => handleRateMedicine(item.medicine.id)} disabled={!mr.rating || medSubmitting === item.medicine.id}
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline">
                    {medSubmitting === item.medicine.id ? 'Saving…' : mr.existing ? 'Update rating' : 'Rate this medicine'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Delivery Address</p>
          {order.shipping_address ? (
            <div className="text-sm text-on-surface-variant space-y-1">
              <p className="font-medium text-on-surface">{(order.shipping_address as any).full_name}</p>
              <p>{(order.shipping_address as any).address_line1}</p>
              {(order.shipping_address as any).address_line2 && <p>{(order.shipping_address as any).address_line2}</p>}
              <p>{(order.shipping_address as any).city}, {(order.shipping_address as any).state}</p>
              <p>{(order.shipping_address as any).phone}</p>
            </div>
          ) : <p className="text-sm text-on-surface-variant">No address on file</p>}
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Payment Summary</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal</span>
              <span className="text-on-surface">NPR {order.items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0).toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Delivery</span>
              <span className="text-on-surface">NPR {Number(order.delivery_charge || 0).toFixed(0)}</span>
            </div>
            {Number(order.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Coupon Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</span>
                <span>− NPR {Number(order.discount).toFixed(0)}</span>
              </div>
            )}
            {Number(order.wallet_used || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Wallet Applied</span>
                <span>− NPR {Number(order.wallet_used).toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-1.5">
              <span>Total</span>
              <span>NPR {Number(order.total_amount).toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant pt-1">
              <span>Method</span>
              <span className="text-on-surface capitalize">{order.payment_method?.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span>Status</span>
              <span className={`font-medium capitalize ${order.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.payment_status}</span>
            </div>
          </div>
        </div>
      </div>

      {isDelivered && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
          <p className="text-sm font-bold text-on-surface">{order.order_rating ? 'Your Rating' : 'Rate This Order'}</p>
          <form onSubmit={handleRateOrder} className="space-y-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setOrderRating(n)}>
                  <span className={`material-symbols-outlined ${n <= orderRating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '26px' }}>star</span>
                </button>
              ))}
            </div>
            <textarea value={orderComment} onChange={(e) => setOrderComment(e.target.value)} rows={2}
              placeholder="How was your overall delivery experience?"
              className="w-full px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            <button type="submit" disabled={!orderRating || ratingLoading}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {ratingLoading ? 'Saving...' : order.order_rating ? 'Update Rating' : 'Submit Rating'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
