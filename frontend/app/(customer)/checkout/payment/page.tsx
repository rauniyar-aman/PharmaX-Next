'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useCart } from '@/hooks/useCart'

const METHODS = [
  { id: 'CASH_ON_DELIVERY', label: 'Cash on Delivery', icon: 'payments', desc: 'Pay when your order arrives' },
  { id: 'ESEWA', label: 'eSewa', icon: 'account_balance_wallet', desc: 'Pay via eSewa digital wallet' },
  { id: 'KHALTI', label: 'Khalti', icon: 'account_balance_wallet', desc: 'Pay via Khalti digital wallet' },
]

export default function CheckoutPaymentPage() {
  const router = useRouter()
  const { cart } = useCart()
  const [method, setMethod] = useState('CASH_ON_DELIVERY')
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem('checkoutAllowed')) { router.replace('/cart'); return }
      if (!sessionStorage.getItem('checkoutAddress')) { router.replace('/checkout/shipping') }
    }
  }, [])

  const hasRx = cart?.items.some((i) => i.medicine.type === 'Rx')

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

  const handlePlace = async () => {
    const addressId = sessionStorage.getItem('checkoutAddress')
    if (!addressId) { router.replace('/checkout/shipping'); return }

    if (hasRx) {
      sessionStorage.setItem('checkoutMethod', method)
      sessionStorage.setItem('checkoutNotes', notes)
      router.push('/checkout/prescription')
      return
    }

    setPlacing(true)
    try {
      if (method === 'ESEWA') {
        const res = await api.post('/payment/esewa/initiate/', { address_id: addressId, notes })
        sessionStorage.removeItem('checkoutAllowed')
        sessionStorage.removeItem('checkoutAddress')
        submitEsewaForm(res.data.data.formUrl, res.data.data.params)
        return
      }
      if (method === 'KHALTI') {
        const res = await api.post('/payment/khalti/initiate/', { address_id: addressId, notes })
        sessionStorage.removeItem('checkoutAllowed')
        sessionStorage.removeItem('checkoutAddress')
        window.location.href = res.data.data.payment_url
        return
      }
      const res = await api.post('/payment/cod/place/', { address_id: addressId, notes })
      sessionStorage.removeItem('checkoutAllowed')
      sessionStorage.removeItem('checkoutAddress')
      sessionStorage.setItem('lastOrderId', res.data.data.order.id)
      router.push('/checkout/confirmation')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to place order.')
    } finally {
      setPlacing(false)
    }
  }

  const items = cart?.items || []
  const subtotal = items.reduce((s, i) => s + Number(i.medicine.price) * i.quantity, 0)
  const delivery = subtotal >= 500 ? 0 : 50
  const total = subtotal + delivery

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span className="text-on-surface font-medium">1. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="font-semibold text-primary">2. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>3. Confirm</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Payment Method</h1>

      {hasRx && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <span className="material-symbols-outlined ms-filled text-amber-600 mt-0.5" style={{ fontSize: '20px' }}>warning</span>
          <div>
            <p className="text-sm font-semibold text-amber-700">Prescription required</p>
            <p className="text-xs text-amber-600 mt-0.5">Your cart has Rx medicines. You'll need to upload a prescription before placing the order.</p>
          </div>
        </div>
      )}

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

      <div>
        <label className="text-xs font-medium text-on-surface-variant">Order Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Any special instructions for delivery..."
          className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-2 text-sm">
        <p className="font-bold text-on-surface text-sm">Order Total</p>
        <div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span className="text-on-surface">NPR {subtotal.toFixed(0)}</span></div>
        <div className="flex justify-between text-on-surface-variant"><span>Delivery</span><span className={delivery === 0 ? 'text-primary font-medium' : 'text-on-surface'}>{delivery === 0 ? 'Free' : `NPR ${delivery}`}</span></div>
        <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-2"><span>Total</span><span>NPR {total.toFixed(0)}</span></div>
      </div>

      <button onClick={handlePlace} disabled={placing}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
        {placing ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />{method === 'ESEWA' ? 'Redirecting to eSewa...' : method === 'KHALTI' ? 'Redirecting to Khalti...' : 'Placing Order...'}</> : hasRx ? 'Continue to Prescription' : method === 'ESEWA' ? 'Pay with eSewa' : method === 'KHALTI' ? 'Pay with Khalti' : 'Place Order'}
      </button>
    </div>
  )
}
