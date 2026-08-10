'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { FulfillmentSummary } from '@/types'

const POLL_INTERVAL_MS = 3000
const SLOW_HINT_MS = 15000

type Phase = 'submitting' | 'broadcasting' | 'resolved' | 'error'

export default function CheckoutBroadcastingPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('submitting')
  const [summary, setSummary] = useState<FulfillmentSummary | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [isBuyNow, setIsBuyNow] = useState(false)
  const startedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    setIsBuyNow(!!sessionStorage.getItem('checkoutBuyNowItems'))

    const addressId = sessionStorage.getItem('checkoutAddress')
    if (!sessionStorage.getItem('checkoutAllowed') || !addressId) {
      router.replace('/checkout/shipping')
      return
    }

    const existingOrderId = sessionStorage.getItem('checkoutOrderId')
    if (existingOrderId) {
      // Resuming (e.g. the page was remounted) — the order already exists, just resume polling.
      setOrderId(existingOrderId)
      setPhase('broadcasting')
      return
    }

    const notes = sessionStorage.getItem('checkoutNotes') || ''
    const prescriptionId = sessionStorage.getItem('checkoutPrescription')
    const payload: Record<string, any> = { address_id: addressId, notes }
    if (prescriptionId) payload.prescription_id = prescriptionId

    // Buy Now: send this exact item instead of letting the backend pull from the cart, so a
    // direct purchase never touches (or clears) whatever's already sitting in the real cart.
    const buyNowRaw = sessionStorage.getItem('checkoutBuyNowItems')
    if (buyNowRaw) {
      try {
        payload.items = JSON.parse(buyNowRaw).map((i: any) => ({ medicine_id: i.medicine_id, quantity: i.quantity }))
      } catch {}
    }

    api.post('/orders/checkout/', payload)
      .then((res) => {
        const id = res.data.data.order.id
        sessionStorage.setItem('checkoutOrderId', id)
        setOrderId(id)
        setPhase('broadcasting')
      })
      .catch((err) => {
        setErrorMessage(err.response?.data?.message || 'Failed to start checkout.')
        setPhase('error')
      })
  }, [])

  useEffect(() => {
    if (phase !== 'broadcasting' || !orderId) return

    const slowHintTimer = setTimeout(() => setShowSlowHint(true), SLOW_HINT_MS)

    const poll = async () => {
      try {
        const res = await api.get<{ data: FulfillmentSummary }>(`/orders/${orderId}/fulfillment-summary/`)
        const data = res.data.data
        setSummary(data)
        if (data.order_status !== 'BROADCASTING') {
          if (pollRef.current) clearInterval(pollRef.current)
          setPhase('resolved')
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          // the order this tab was watching no longer exists (e.g. removed on the backend) —
          // this is not transient, retrying forever would just spin the "Checking..." screen
          // eternally with no way out, so stop polling and send them back to restart checkout.
          if (pollRef.current) clearInterval(pollRef.current)
          sessionStorage.removeItem('checkoutOrderId')
          setErrorMessage('This order is no longer available. Please start checkout again.')
          setPhase('error')
          return
        }
        // any other error (network blip, 5xx) — transient, keep polling
      }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      clearTimeout(slowHintTimer)
    }
  }, [phase, orderId])

  const clearCheckoutSession = () => {
    sessionStorage.removeItem('checkoutAllowed')
    sessionStorage.removeItem('checkoutAddress')
    sessionStorage.removeItem('checkoutNotes')
    sessionStorage.removeItem('checkoutPrescription')
    sessionStorage.removeItem('checkoutOrderId')
    sessionStorage.removeItem('checkoutBuyNowItems')
  }

  // Shared "where does this tab go once there's nothing left to wait for" logic — used both when
  // the customer walks away empty-handed after resolution, and when they cancel mid-search.
  const goBackAfterAbandoning = (buyNowRaw: string | null) => {
    clearCheckoutSession()
    // Buy Now never touched the cart, so "back to cart" would just be an empty, unrelated page —
    // send them back to the medicine instead.
    if (buyNowRaw) {
      try {
        const medicineId = JSON.parse(buyNowRaw)[0]?.medicine_id
        if (medicineId) { router.push(`/medicines/${medicineId}`); return }
      } catch {}
    }
    router.push('/cart')
  }

  const handleReturnToCart = () => {
    const buyNowRaw = sessionStorage.getItem('checkoutBuyNowItems')
    goBackAfterAbandoning(buyNowRaw)
    toast('This checkout was abandoned — your cart is unchanged.', { icon: 'ℹ️' })
  }

  const handleCancelSearch = async () => {
    if (!orderId) return
    setCancelling(true)
    try {
      await api.put(`/orders/${orderId}/cancel/`)
      if (pollRef.current) clearInterval(pollRef.current)
      const buyNowRaw = sessionStorage.getItem('checkoutBuyNowItems')
      goBackAfterAbandoning(buyNowRaw)
      toast('Search cancelled — no charge was made.', { icon: 'ℹ️' })
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not cancel — please try again.')
      setCancelling(false)
    }
  }

  const handleContinueToPayment = () => {
    router.push('/checkout/payment')
  }

  if (phase === 'submitting' || phase === 'broadcasting') {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Checking Nearby Pharmacies</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            We're asking pharmacies near your delivery address which of your items they have in stock.
          </p>
          {showSlowHint && (
            <p className="text-xs text-on-surface-variant mt-3">
              This can take a few minutes — feel free to keep this tab open, we'll update automatically as pharmacies respond.
            </p>
          )}
        </div>
        {orderId && (
          <button onClick={handleCancelSearch} disabled={cancelling}
            className="text-sm font-semibold text-error hover:underline disabled:opacity-60">
            {cancelling ? 'Cancelling…' : 'Cancel Search'}
          </button>
        )}
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 mx-auto rounded-full bg-error/10 flex items-center justify-center">
          <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '32px' }}>error</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Couldn't Start Checkout</h1>
          <p className="text-sm text-on-surface-variant mt-2">{errorMessage}</p>
        </div>
        <button onClick={() => { clearCheckoutSession(); router.push('/cart') }}
          className="w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          Back to Cart
        </button>
      </div>
    )
  }

  // phase === 'resolved'
  const accepted = summary?.accepted_items || []
  const unfulfilled = summary?.unfulfilled_items || []
  const hasAccepted = accepted.length > 0

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span className="text-on-surface font-medium">1. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="font-semibold text-primary">2. Availability</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>3. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>4. Confirm</span>
      </div>

      {hasAccepted ? (
        <>
          <h1 className="text-2xl font-bold text-on-surface">Here's What's Ready</h1>
          <p className="text-sm text-on-surface-variant">Nearby pharmacies have responded. You'll only be charged for the items below.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-on-surface">No Pharmacy Had These Items</h1>
          <p className="text-sm text-on-surface-variant">No pharmacy near your delivery address had any of these in stock right now.</p>
        </>
      )}

      {accepted.length > 0 && (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Ready to order</p>
          </div>
          <div className="divide-y divide-outline-variant">
            {accepted.map((item) => (
              <div key={item.order_item_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '18px' }}>check_circle</span>
                  <span className="text-sm text-on-surface">{item.medicine_name} <span className="text-on-surface-variant">× {item.quantity}</span></span>
                </div>
                <span className="text-sm font-medium text-on-surface">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unfulfilled.length > 0 && (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 py-2.5 bg-surface-container-low border-b border-outline-variant">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Not available nearby</p>
          </div>
          <div className="divide-y divide-outline-variant">
            {unfulfilled.map((item) => (
              <div key={item.order_item_id} className="flex items-center justify-between px-4 py-3 opacity-60">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>cancel</span>
                  <span className="text-sm text-on-surface line-through">{item.medicine_name} × {item.quantity}</span>
                </div>
                <span className="text-xs text-on-surface-variant">Not this time</span>
              </div>
            ))}
          </div>
          <p className="px-4 py-2 text-xs text-on-surface-variant">These items won't be charged or delivered with this order.</p>
        </div>
      )}

      {hasAccepted ? (
        <button onClick={handleContinueToPayment}
          className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
          Continue to Payment
        </button>
      ) : (
        <button onClick={handleReturnToCart}
          className="w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          {isBuyNow ? 'Back to Medicine' : 'Return to Cart'}
        </button>
      )}
    </div>
  )
}
