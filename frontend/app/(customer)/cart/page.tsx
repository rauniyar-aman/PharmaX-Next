'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useCart } from '@/hooks/useCart'
import { resolveImg } from '@/lib/resolveImg'

export default function CartPage() {
  const router = useRouter()
  const { cart, loading, fetchCart, updateItem, removeItem } = useCart()

  useEffect(() => { fetchCart() }, [])

  const items = cart?.items || []
  const subtotal = items.reduce((s, i) => s + Number(i.medicine.price) * i.quantity, 0)
  const delivery = subtotal >= 500 ? 0 : 50
  const total = subtotal + delivery

  const handleQty = async (itemId: string, qty: number) => {
    if (qty < 1) return
    try { await updateItem(itemId, qty) }
    catch { toast.error('Failed to update quantity.') }
  }

  const handleRemove = async (itemId: string) => {
    try { await removeItem(itemId); toast.success('Item removed.') }
    catch { toast.error('Failed to remove item.') }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!items.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>shopping_cart</span>
      <h2 className="text-xl font-bold text-on-surface">Your cart is empty</h2>
      <p className="text-sm text-on-surface-variant">Browse medicines and add them to your cart</p>
      <Link href="/medicines" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Browse Medicines
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">My Cart</h1>
        <span className="text-sm text-on-surface-variant">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex gap-4">
              {item.medicine.image_url ? (
                <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name} className="w-20 h-20 object-cover rounded-xl flex-shrink-0" />
              ) : (
                <div className="w-20 h-20 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '32px' }}>medication</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.medicine.type === 'Rx' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                      {item.medicine.type}
                    </span>
                    <p className="text-sm font-semibold text-on-surface mt-1 leading-snug">{item.medicine.name}</p>
                    <p className="text-xs text-on-surface-variant">{item.medicine.brand_name}</p>
                  </div>
                  <button onClick={() => handleRemove(item.id)} className="text-error hover:bg-error/10 rounded-lg p-1 transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-0 border border-outline-variant rounded-xl overflow-hidden">
                    <button onClick={() => handleQty(item.id, item.quantity - 1)} disabled={item.quantity <= 1}
                      className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-on-surface">{item.quantity}</span>
                    <button onClick={() => handleQty(item.id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                    </button>
                  </div>
                  <span className="font-bold text-on-surface">NPR {(Number(item.medicine.price) * item.quantity).toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <h2 className="font-bold text-on-surface text-base">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>Subtotal</span>
                <span className="text-on-surface font-medium">NPR {subtotal.toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Delivery</span>
                <span className={delivery === 0 ? 'text-primary font-medium' : 'text-on-surface font-medium'}>
                  {delivery === 0 ? 'Free' : `NPR ${delivery}`}
                </span>
              </div>
              {delivery > 0 && (
                <p className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl p-2">
                  Add NPR {(500 - subtotal).toFixed(0)} more for free delivery
                </p>
              )}
              <div className="border-t border-outline-variant pt-2 flex justify-between font-bold text-on-surface">
                <span>Total</span>
                <span>NPR {total.toFixed(0)}</span>
              </div>
            </div>
            <button onClick={() => { sessionStorage.setItem('checkoutAllowed', '1'); router.push('/checkout/shipping') }}
              className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
              Proceed to Checkout
            </button>
            <Link href="/medicines" className="block text-center text-sm text-primary font-medium hover:underline">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
