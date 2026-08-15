'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Order, Prescription } from '@/types'

// The actual marketplace order lifecycle — sync_order_status() only ever moves an Order through
// these four statuses. CONFIRMED/PROCESSING/SHIPPED/OUT_FOR_DELIVERY exist in the model's choices
// but are never set by the live flow, so a tracker built around them (as this used to be) never
// highlights anything for BROADCASTING/AWAITING_PAYMENT and sits frozen on "Placed" for the
// entire multi-day window between payment and delivery. The fulfillments list below fills that
// gap with real per-pharmacy-leg progress.
const STEPS = ['BROADCASTING', 'AWAITING_PAYMENT', 'PLACED', 'DELIVERED']
const STEP_LABELS: Record<string, string> = {
  BROADCASTING: 'Finding Pharmacies',
  AWAITING_PAYMENT: 'Awaiting Payment',
  PLACED: 'Order Placed',
  DELIVERED: 'Delivered',
}

const STATUS_COLORS: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'bg-amber-50 text-amber-600',
  PRESCRIPTION_REJECTED: 'bg-error/10 text-error',
  BROADCASTING: 'bg-surface-container text-on-surface-variant',
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-600',
  NO_PHARMACY_FOUND: 'bg-error/10 text-error',
  PLACED: 'bg-blue-50 text-blue-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  PROCESSING: 'bg-amber-50 text-amber-600',
  SHIPPED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
  RETURNED: 'bg-error/10 text-error',
}

const FULFILLMENT_STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  BROADCASTING:       { label: 'Awaiting Pharmacy',  color: 'bg-surface-container text-on-surface-variant', icon: 'wifi_tethering' },
  ACCEPTED:           { label: 'Preparing',           color: 'bg-amber-50 text-amber-600',      icon: 'inventory' },
  PREPARED:           { label: 'Prepared',            color: 'bg-amber-50 text-amber-600',      icon: 'task_alt' },
  PACKED:             { label: 'Packed',              color: 'bg-blue-50 text-blue-600',        icon: 'inventory_2' },
  NO_PHARMACY_FOUND:  { label: 'No Pharmacy Found',   color: 'bg-error/10 text-error',          icon: 'help' },
  AWAITING_DELIVERY:  { label: 'Ready for Pickup',    color: 'bg-blue-50 text-blue-600',        icon: 'hourglass_top' },
  OUT_FOR_DELIVERY:   { label: 'Out for Delivery',    color: 'bg-indigo-50 text-indigo-600',    icon: 'sports_motorsports' },
  DELIVERED:          { label: 'Delivered',           color: 'bg-emerald-50 text-emerald-600',  icon: 'check_circle' },
  CANCELLED:          { label: 'Cancelled',           color: 'bg-error/10 text-error',          icon: 'cancel' },
}

interface MedRating { rating: number; comment: string; existing: boolean }
interface RiderRating { rating: number; comment: string; existing: boolean }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [orderRating, setOrderRating] = useState(0)
  const [orderComment, setOrderComment] = useState('')
  const [ratingLoading, setRatingLoading] = useState(false)
  const [medRatings, setMedRatings] = useState<Record<string, MedRating>>({})
  const [medSubmitting, setMedSubmitting] = useState<string | null>(null)
  const [riderRatings, setRiderRatings] = useState<Record<string, RiderRating>>({})
  const [riderSubmitting, setRiderSubmitting] = useState<string | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [rxSelections, setRxSelections] = useState<Record<string, string>>({})
  const [attaching, setAttaching] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    api.get(`/orders/${id}/`).then(async (r) => {
      const o: Order = r.data.data.order
      setOrder(o)
      if (o.order_rating) { setOrderRating(o.order_rating); setOrderComment(o.order_comment || '') }

      const ratedFulfillments = (o.fulfillments || []).filter((f) => f.status === 'DELIVERED' && f.delivery_agent_name)
      if (ratedFulfillments.length) {
        setRiderRatings(Object.fromEntries(ratedFulfillments.map((f) => [
          f.id,
          f.rider_rating
            ? { rating: f.rider_rating, comment: f.rider_rating_comment || '', existing: true }
            : { rating: 0, comment: '', existing: false },
        ])))
      }

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

  useEffect(() => {
    if (!order || (order.status !== 'AWAITING_PRESCRIPTION' && order.status !== 'PRESCRIPTION_REJECTED')) return
    api.get('/prescriptions/').then((r) => {
      const usable = (r.data.data.prescriptions || []).filter((p: Prescription) => p.status === 'VERIFIED' || p.status === 'PENDING')
      setPrescriptions(usable)
    }).catch(() => {})
  }, [order?.status])

  const handleRxUpload = async (medicineId: string, files: FileList) => {
    if (files.length === 0) return
    if (files.length > 10) { toast.error('You can upload up to 10 pages at once.'); return }
    const formData = new FormData()
    Array.from(files).forEach((f) => formData.append('files', f))
    formData.append('group_as_one', 'true')
    setUploadingFor(medicineId)
    try {
      const res = await api.post('/prescriptions/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newRx = res.data.data.prescription
      setPrescriptions((p) => [newRx, ...p])
      setRxSelections((s) => ({ ...s, [medicineId]: newRx.id }))
      toast.success(files.length > 1 ? `Prescription uploaded (${files.length} pages)!` : 'Prescription uploaded!')
    } catch {
      toast.error('Upload failed.')
    } finally {
      setUploadingFor(null)
    }
  }

  const handleAttachPrescriptions = async () => {
    if (!order) return
    const rxItems = order.items.filter((i) => i.medicine.type === 'Rx')
    const missing = rxItems.filter((i) => !rxSelections[i.medicine.id])
    if (missing.length > 0) {
      toast.error(`Please select or upload a prescription for ${missing.map((i) => i.medicine.name).join(', ')}.`)
      return
    }
    setAttaching(true)
    try {
      const res = await api.post(`/orders/${order.id}/attach-prescription/`, { item_prescriptions: rxSelections })
      setOrder(res.data.data.order)
      toast.success(
        res.data.data.order.status === 'AWAITING_PRESCRIPTION'
          ? 'Prescription submitted — we\'ll notify you once it\'s reviewed.'
          : 'Prescription submitted!'
      )
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to attach prescription.')
    } finally {
      setAttaching(false)
    }
  }

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

  const handleDelete = async () => {
    if (!order || !confirm('Permanently delete this cancelled order? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete(`/orders/${order.id}/`)
      toast.success('Order deleted.')
      router.push('/orders')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not delete order.')
      setDeleting(false)
    }
  }

  const handleCompletePayment = () => {
    if (!order) return
    // Resumes the same /checkout/payment flow used right after checkout — it only needs
    // checkoutOrderId (the order + address are already persisted server-side).
    sessionStorage.setItem('checkoutAllowed', '1')
    sessionStorage.setItem('checkoutOrderId', order.id)
    router.push('/checkout/payment')
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

  const handleRateRider = async (fulfillmentId: string) => {
    const r = riderRatings[fulfillmentId]
    if (!r || !r.rating) return
    setRiderSubmitting(fulfillmentId)
    try {
      await api.put(`/orders/fulfillments/${fulfillmentId}/rate-rider/`, { rider_rating: r.rating, rider_rating_comment: r.comment })
      setRiderRatings((p) => ({ ...p, [fulfillmentId]: { ...p[fulfillmentId], existing: true } }))
      toast.success('Thanks for rating your rider!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not save rating.')
    } finally {
      setRiderSubmitting(null)
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
  const needsPrescriptionAction = order.status === 'AWAITING_PRESCRIPTION' || order.status === 'PRESCRIPTION_REJECTED'
  const canCancel = ['AWAITING_PRESCRIPTION', 'PRESCRIPTION_REJECTED', 'BROADCASTING', 'AWAITING_PAYMENT', 'PLACED', 'CONFIRMED'].includes(order.status)
  const isDelivered = order.status === 'DELIVERED'
  const awaitingPayment = order.status === 'AWAITING_PAYMENT'
  const totalPending = awaitingPayment && Number(order.total_amount) === 0
  // AWAITING_PAYMENT just means "every item got a final answer" — it does NOT mean a pharmacy
  // accepted something. If nothing was accepted, no OrderFulfillment (and so no fulfillments
  // entry) was ever created, and paying would just fail server-side, so that path needs its own
  // "nothing to pay for, cancel instead" messaging rather than the misleading "confirmed" banner.
  const hasAcceptedItems = !!order.fulfillments?.length
  const nothingAccepted = awaitingPayment && !hasAcceptedItems

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
          {awaitingPayment && hasAcceptedItems && (
            <button onClick={handleCompletePayment}
              className="px-4 py-1.5 bg-primary text-on-primary text-sm font-semibold rounded-full hover:opacity-90 transition-opacity flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>payments</span>
              Complete Payment
            </button>
          )}
          {hasAcceptedItems && !isCancelled && !isDelivered && (
            <Link href={`/orders/${order.id}/track`}
              className="px-4 py-1.5 border border-primary/30 text-primary text-sm font-semibold rounded-full hover:bg-primary/10 transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>location_on</span>
              Track Live Location
            </Link>
          )}
          {canCancel && (
            <button onClick={handleCancel} disabled={cancelling}
              className="px-4 py-1.5 border border-error/30 text-error text-sm font-semibold rounded-full hover:bg-error/10 transition-colors disabled:opacity-60 flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>cancel</span>
              {cancelling ? 'Cancelling…' : 'Cancel Order'}
            </button>
          )}
          {order.status === 'CANCELLED' && (
            <button onClick={handleDelete} disabled={deleting}
              className="px-4 py-1.5 border border-error/30 text-error text-sm font-semibold rounded-full hover:bg-error/10 transition-colors disabled:opacity-60 flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
              {deleting ? 'Deleting…' : 'Delete Order'}
            </button>
          )}
        </div>
      </div>

      {awaitingPayment && hasAcceptedItems && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-amber-600" style={{ fontSize: '20px' }}>info</span>
          <p className="text-sm text-amber-800">
            A pharmacy has confirmed your items, but payment hasn't been completed yet — this order won't be prepared until you finish checkout.
          </p>
        </div>
      )}

      {nothingAccepted && (
        <div className="bg-error/5 border border-error/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '20px' }}>error</span>
          <p className="text-sm text-error">
            No pharmacy near your delivery address accepted these items, so there's nothing to pay for. Cancel this order and try again.
          </p>
        </div>
      )}

      {order.status === 'AWAITING_PRESCRIPTION' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-amber-600" style={{ fontSize: '20px' }}>pending_actions</span>
          <p className="text-sm text-amber-800">
            This order includes prescription medicine(s) awaiting verification. We'll confirm the order and send it to nearby pharmacies once approved.
          </p>
        </div>
      )}

      {order.status === 'PRESCRIPTION_REJECTED' && (
        <div className="bg-error/5 border border-error/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '20px' }}>error</span>
          <p className="text-sm text-error">A prescription for this order was rejected. Upload a new one below to continue.</p>
        </div>
      )}

      {needsPrescriptionAction && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-5">
          <p className="text-sm font-bold text-on-surface">Attach Prescriptions</p>
          {order.items.filter((i) => i.medicine.type === 'Rx').map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>medication</span>
                <p className="text-sm font-semibold text-on-surface">{item.medicine.name}</p>
              </div>
              <div className="space-y-2 pl-1">
                {prescriptions.map((rx) => (
                  <label key={rx.id} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${rxSelections[item.medicine.id] === rx.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/40'}`}>
                    <input type="radio" name={`rx-${item.medicine.id}`} value={rx.id} checked={rxSelections[item.medicine.id] === rx.id}
                      onChange={() => setRxSelections((s) => ({ ...s, [item.medicine.id]: rx.id }))} className="accent-primary" />
                    <span className="material-symbols-outlined text-on-surface-variant ms-filled" style={{ fontSize: '20px' }}>description</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{rx.file_name || rx.notes || 'Prescription'}</p>
                      <p className="text-xs text-on-surface-variant">{new Date(rx.uploaded_at).toLocaleDateString()} · <span className={rx.status === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-600'}>{rx.status}</span></p>
                    </div>
                    {rx.file_url && (
                      <a href={resolveImg(rx.file_url) || undefined} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                        View <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
                      </a>
                    )}
                  </label>
                ))}
                <div onClick={() => fileRefs.current[item.medicine.id]?.click()}
                  className="border-2 border-dashed border-outline-variant rounded-2xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '26px' }}>upload_file</span>
                  <p className="text-xs font-medium text-on-surface mt-1">{uploadingFor === item.medicine.id ? 'Uploading...' : 'Click to upload new prescription'}</p>
                  <p className="text-[11px] text-on-surface-variant">JPG, PNG, PDF · Max 5MB each · Select multiple pages at once</p>
                  <input ref={(el) => { fileRefs.current[item.medicine.id] = el }} type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleRxUpload(item.medicine.id, e.target.files) }} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={handleAttachPrescriptions} disabled={attaching}
            className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
            {attaching ? 'Submitting...' : 'Submit Prescription'}
          </button>
        </div>
      )}

      {!isCancelled && !needsPrescriptionAction && (
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
                  <p className="text-[10px] text-center text-on-surface-variant mt-1.5 max-w-[60px] leading-tight">{STEP_LABELS[step]}</p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < currentStep ? 'bg-primary' : 'bg-outline-variant'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!order.fulfillments?.length && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface mb-1">Pharmacy Progress</p>
          {order.fulfillments.map((f) => {
            const cfg = FULFILLMENT_STATUS_CFG[f.status] || { label: f.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
            const rr = riderRatings[f.id]
            const canRateRider = f.status === 'DELIVERED' && f.delivery_agent_name && rr
            return (
              <div key={f.id} className="bg-surface-container-low rounded-xl px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{f.pharmacy_name || 'Pharmacy'}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {f.items.map((i) => `${i.medicine_name} × ${i.quantity}`).join(', ')}
                      {f.delivery_agent_name ? ` · Rider: ${f.delivery_agent_name}` : ''}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                </div>
                {canRateRider && (
                  <div className="flex items-center gap-2 pl-1">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button"
                          onClick={() => setRiderRatings((p) => ({ ...p, [f.id]: { ...p[f.id], rating: n } }))}>
                          <span className={`material-symbols-outlined ${n <= rr.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '18px' }}>star</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => handleRateRider(f.id)} disabled={!rr.rating || riderSubmitting === f.id}
                      className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline">
                      {riderSubmitting === f.id ? 'Saving…' : rr.existing ? 'Update rider rating' : 'Rate this rider'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
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
              {nothingAccepted ? (
                <span className="text-error font-semibold">Not applicable</span>
              ) : totalPending ? (
                <span className="text-amber-600 font-semibold">Pending payment</span>
              ) : (
                <span>NPR {Number(order.total_amount).toFixed(0)}</span>
              )}
            </div>
            <div className="flex justify-between text-on-surface-variant pt-1">
              <span>Method</span>
              <span className="text-on-surface capitalize">{order.payment_method ? order.payment_method.replace(/_/g, ' ') : 'Not selected yet'}</span>
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
