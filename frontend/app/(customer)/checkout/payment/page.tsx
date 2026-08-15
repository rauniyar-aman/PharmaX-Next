'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { FulfillmentSummary } from '@/types'

const METHODS = [
  { id: 'CASH_ON_DELIVERY', label: 'Cash on Delivery', icon: 'payments', desc: 'Pay when your order arrives' },
  { id: 'ESEWA', label: 'eSewa', icon: 'account_balance_wallet', desc: 'Pay via eSewa digital wallet' },
  { id: 'KHALTI', label: 'Khalti', icon: 'account_balance_wallet', desc: 'Pay via Khalti digital wallet' },
]

export default function CheckoutPaymentPage() {
  const router = useRouter()
  const [orderId, setOrderId] = useState<string | null>(null)
  const [summary, setSummary] = useState<FulfillmentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [method, setMethod] = useState('CASH_ON_DELIVERY')
  const [placing, setPlacing] = useState(false)

  const [couponInput, setCouponInput] = useState('')
  const [applying, setApplying] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_amount: string } | null>(null)

  const [walletBalance, setWalletBalance] = useState(0)
  const [useWallet, setUseWallet] = useState(false)

  useEffect(() => {
    const id = sessionStorage.getItem('checkoutOrderId')
    if (!id) { router.replace('/checkout/shipping'); return }
    setOrderId(id)

    api.get<{ data: FulfillmentSummary }>(`/orders/${id}/fulfillment-summary/`)
      .then((r) => {
        const data = r.data.data
        if (data.order_status !== 'AWAITING_PAYMENT') {
          setLoadError('This order is no longer ready for payment. It may have already been paid, or the checkout session expired.')
          return
        }
        if (data.accepted_items.length === 0) {
          setLoadError('No items in this order were accepted by a nearby pharmacy — there is nothing to pay for.')
          return
        }
        setSummary(data)
      })
      .catch(() => setLoadError('Could not load this order.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api.get('/wallet/').then((r) => setWalletBalance(Number(r.data.data.wallet.balance))).catch(() => {})
  }, [])

  const items = summary?.accepted_items || []
  const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0)
  const delivery = subtotal >= 500 ? 0 : 50
  const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount_amount) : 0
  const payableBeforeWallet = Math.max(0, subtotal + delivery - couponDiscount)
  const walletApplied = useWallet ? Math.min(walletBalance, payableBeforeWallet) : 0
  const total = payableBeforeWallet - walletApplied

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setApplying(true)
    try {
      const res = await api.post('/coupons/validate/', { code: couponInput.trim(), subtotal })
      setAppliedCoupon({ code: res.data.data.code, discount_amount: res.data.data.discount_amount })
      toast.success(`Coupon applied! You saved NPR ${Number(res.data.data.discount_amount).toFixed(0)}`)
    } catch (err: any) {
      setAppliedCoupon(null)
      toast.error(err.response?.data?.message || 'Invalid coupon code.')
    } finally {
      setApplying(false)
    }
  }

  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput('') }

  const submitEsewaForm = (formUrl: string, params: Record<string, string>) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = formUrl
    Object.entries(params).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  const clearCheckoutSession = () => {
    sessionStorage.removeItem('checkoutAllowed')
    sessionStorage.removeItem('checkoutAddress')
    sessionStorage.removeItem('checkoutNotes')
    sessionStorage.removeItem('checkoutItemPrescriptions')
    sessionStorage.removeItem('checkoutOrderId')
    sessionStorage.removeItem('checkoutBuyNowItems')
    sessionStorage.removeItem('checkoutHasRx')
  }

  const handlePlace = async () => {
    if (!orderId) return
    setPlacing(true)
    const payload: Record<string, any> = { order_id: orderId }
    if (appliedCoupon) payload.coupon_code = appliedCoupon.code
    if (useWallet) payload.use_wallet = true
    try {
      if (method === 'ESEWA') {
        const res = await api.post('/payment/esewa/initiate/', payload)
        clearCheckoutSession()
        submitEsewaForm(res.data.data.formUrl, res.data.data.params)
        return
      }
      if (method === 'KHALTI') {
        const res = await api.post('/payment/khalti/initiate/', payload)
        clearCheckoutSession()
        window.location.href = res.data.data.payment_url
        return
      }
      const res = await api.post('/payment/cod/place/', payload)
      clearCheckoutSession()
      sessionStorage.setItem('lastOrderId', res.data.data.order.id)
      router.push('/checkout/confirmation')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to place order.')
    } finally {
      setPlacing(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (loadError) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 mx-auto rounded-full bg-error/10 flex items-center justify-center">
          <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '32px' }}>error</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Can't Continue to Payment</h1>
          <p className="text-sm text-on-surface-variant mt-2">{loadError}</p>
        </div>
        <button onClick={() => { clearCheckoutSession(); router.push('/cart') }}
          className="w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          Back to Cart
        </button>
      </div>
    )
  }

  const hasRx = typeof window !== 'undefined' && sessionStorage.getItem('checkoutHasRx') === '1'

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        {hasRx && (
          <>
            <span className="text-on-surface font-medium">1. Prescription</span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          </>
        )}
        <span className="text-on-surface font-medium">{hasRx ? '2' : '1'}. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{hasRx ? '3' : '2'}. Availability</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="font-semibold text-primary">{hasRx ? '4' : '3'}. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>{hasRx ? '5' : '4'}. Confirm</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Payment Method</h1>

      <div className="space-y-2">
        {METHODS.map((m) => (
          <label key={m.id} className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-colors ${method === m.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/40'}`}>
            <input type="radio" name="payment" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-primary" />
            <span className="material-symbols-outlined ms-filled text-on-surface-variant" style={{ fontSize: '22px' }}>{m.icon}</span>
            <div>
              <p className="text-sm font-semibold text-on-surface">{m.label}</p>
              <p className="text-xs text-on-surface-variant">{m.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
        <p className="text-sm font-bold text-on-surface">Have a coupon?</p>
        {appliedCoupon ? (
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: '18px' }}>local_offer</span>
              <span className="text-sm font-semibold text-emerald-700">{appliedCoupon.code}</span>
              <span className="text-xs text-emerald-600">— NPR {Number(appliedCoupon.discount_amount).toFixed(0)} off</span>
            </div>
            <button onClick={removeCoupon} className="text-xs font-semibold text-error hover:underline">Remove</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="text" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="flex-1 px-3 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            <button onClick={handleApplyCoupon} disabled={applying || !couponInput.trim()}
              className="px-4 py-2.5 border border-outline-variant rounded-xl text-sm font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-60">
              {applying ? 'Checking...' : 'Apply'}
            </button>
          </div>
        )}

        {walletBalance > 0 && (
          <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} className="accent-primary" />
              <span className="text-sm text-on-surface">Use Wallet Balance</span>
            </div>
            <span className="text-sm font-semibold text-primary">NPR {walletBalance.toFixed(0)} available</span>
          </label>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-2 text-sm">
        <p className="font-bold text-on-surface text-sm">Order Total</p>
        <p className="text-xs text-on-surface-variant">Charging only for the {items.length} item{items.length === 1 ? '' : 's'} a nearby pharmacy accepted.</p>
        <div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span className="text-on-surface">NPR {subtotal.toFixed(0)}</span></div>
        <div className="flex justify-between text-on-surface-variant"><span>Delivery</span><span className={delivery === 0 ? 'text-primary font-medium' : 'text-on-surface'}>{delivery === 0 ? 'Free' : `NPR ${delivery}`}</span></div>
        {couponDiscount > 0 && (
          <div className="flex justify-between text-emerald-600"><span>Coupon Discount</span><span>− NPR {couponDiscount.toFixed(0)}</span></div>
        )}
        {walletApplied > 0 && (
          <div className="flex justify-between text-emerald-600"><span>Wallet Applied</span><span>− NPR {walletApplied.toFixed(0)}</span></div>
        )}
        <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-2"><span>Total</span><span>NPR {total.toFixed(0)}</span></div>
      </div>

      <button onClick={handlePlace} disabled={placing}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
        {placing ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />{method === 'ESEWA' ? 'Redirecting to eSewa...' : method === 'KHALTI' ? 'Redirecting to Khalti...' : 'Placing Order...'}</> : method === 'ESEWA' ? 'Pay with eSewa' : method === 'KHALTI' ? 'Pay with Khalti' : 'Place Order'}
      </button>
    </div>
  )
}
