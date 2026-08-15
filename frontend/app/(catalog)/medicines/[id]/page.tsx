'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import type { Medicine, Review, Address } from '@/types'

const FREQUENCIES = [
  { val: 7, label: 'Weekly' },
  { val: 15, label: 'Every 15 Days' },
  { val: 30, label: 'Monthly' },
  { val: 60, label: 'Every 2 Months' },
  { val: 90, label: 'Every 3 Months' },
]

export default function MedicineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle } = useWishlist()
  const { addToCart } = useCart()

  const [medicine, setMedicine] = useState<Medicine | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  // Separate from `qty` so the field can sit empty/mid-edit (e.g. while selecting-all to retype)
  // without snapping back to the last committed number on every keystroke — only committed to
  // `qty` (used for pricing etc.) once it's a valid number, and reconciled on blur.
  const [qtyInput, setQtyInput] = useState('1')
  const [cartLoading, setCartLoading] = useState(false)
  const [tab, setTab] = useState<'details' | 'reviews'>('details')

  const [myRating, setMyRating] = useState(5)
  const [myReview, setMyReview] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [deletingReview, setDeletingReview] = useState(false)

  const myExistingReview = reviews.find((r) => (r as any).is_mine || (r as any).mine)

  const [addresses, setAddresses] = useState<Address[]>([])
  const [subFrequency, setSubFrequency] = useState(30)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    if (!user) return
    api.get('/addresses/').then((r) => setAddresses(r.data.data.addresses || [])).catch(() => {})
  }, [user])

  const handleSubscribe = async () => {
    if (!user) { router.push('/signin'); return }
    const defaultAddr = addresses.find((a) => a.is_default) || addresses[0]
    if (!defaultAddr) { toast.error('Please add a delivery address first.'); router.push('/addresses'); return }
    setSubscribing(true)
    try {
      await api.post('/subscriptions/', { medicine_id: id, address_id: defaultAddr.id, quantity: qty, frequency_days: subFrequency })
      toast.success('Subscribed for auto-refill!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not set up auto-refill.')
    } finally {
      setSubscribing(false)
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.get(`/medicines/${id}/`),
      api.get(`/medicines/${id}/reviews/`),
    ]).then(([medRes, revRes]) => {
      setMedicine(medRes.data.data.medicine)
      const revs: Review[] = revRes.data.data.reviews || []
      setReviews(revs)
      const mine = revs.find((r) => (r as any).is_mine || (r as any).mine)
      if (mine) { setMyRating(mine.rating); setMyReview(mine.comment || '') }
    }).catch(() => toast.error('Medicine not found.')).finally(() => setLoading(false))
  }, [id])

  const handleAddToCart = async () => {
    if (!user) { router.push('/signin'); return }
    setCartLoading(true)
    try {
      await addToCart(id, qty)
      toast.success('Added to cart!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not add to cart.')
    } finally {
      setCartLoading(false)
    }
  }

  const handleBuyNow = () => {
    if (!user) { router.push('/signin'); return }
    if (!medicine) return
    // Bypasses the cart entirely — checkout/broadcasting reads this instead of the cart, and the
    // backend tags the resulting order source='DIRECT' so placing it never touches (or clears)
    // whatever's already sitting in the customer's actual cart.
    sessionStorage.removeItem('checkoutItemPrescriptions')
    sessionStorage.removeItem('checkoutOrderId')
    sessionStorage.setItem('checkoutAllowed', '1')
    sessionStorage.setItem('checkoutHasRx', medicine.type === 'Rx' ? '1' : '0')
    sessionStorage.setItem('checkoutBuyNowItems', JSON.stringify([
      { medicine_id: medicine.id, quantity: qty, is_rx: medicine.type === 'Rx' },
    ]))
    router.push(medicine.type === 'Rx' ? '/checkout/prescription' : '/checkout/shipping')
  }

  const handleWishlist = async () => {
    if (!user) { router.push('/signin'); return }
    await toggle(id)
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { router.push('/signin'); return }
    setReviewLoading(true)
    try {
      if (myExistingReview) {
        await api.put(`/medicines/${id}/reviews/`, { rating: myRating, comment: myReview })
        toast.success('Review updated!')
      } else {
        await api.post(`/medicines/${id}/reviews/`, { rating: myRating, comment: myReview })
        toast.success('Review submitted!')
      }
      const r = await api.get(`/medicines/${id}/reviews/`)
      setReviews(r.data.data.reviews || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not submit review.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleReviewDelete = async () => {
    setDeletingReview(true)
    try {
      await api.delete(`/medicines/${id}/reviews/`)
      toast.success('Review deleted.')
      setMyRating(5)
      setMyReview('')
      const r = await api.get(`/medicines/${id}/reviews/`)
      setReviews(r.data.data.reviews || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not delete review.')
    } finally {
      setDeletingReview(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!medicine) return (
    <div className="text-center py-24">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '56px' }}>medication_liquid</span>
      <p className="text-base font-medium text-on-surface mt-3">Medicine not found</p>
      <Link href="/medicines" className="inline-block mt-4 text-sm text-primary hover:underline">Back to Medicines</Link>
    </div>
  )

  const inWish = wishlistIds.includes(id)
  const isRx = medicine.type === 'Rx'
  const discount = medicine.original_price && Number(medicine.original_price) > Number(medicine.price)
    ? Math.round(((Number(medicine.original_price) - Number(medicine.price)) / Number(medicine.original_price)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/medicines" className="hover:text-primary transition-colors">Medicines</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{medicine.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-surface rounded-2xl border border-outline-variant p-6">
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-surface-container-low">
            {medicine.image_url ? (
              <img src={resolveImg(medicine.image_url) || undefined} alt={medicine.name} className="w-full h-72 object-cover" />
            ) : (
              <div className="w-full h-72 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
                <span className="material-symbols-outlined opacity-30" style={{ fontSize: '80px' }}>medication</span>
                <span className="text-sm opacity-40">No image available</span>
              </div>
            )}
            <span className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-sm font-bold ${isRx ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}>
              {medicine.type}
            </span>
            {discount > 0 && (
              <span className="absolute top-4 right-4 bg-error text-on-error text-xs font-bold px-2.5 py-1.5 rounded-full">
                -{discount}%
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1">{(medicine as any).category_name || (medicine.category as any)?.name}</p>
            <h1 className="text-2xl font-bold text-on-surface leading-tight">{medicine.name}</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">by {medicine.brand?.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`material-symbols-outlined ${i < Math.floor(Number(medicine.rating)) ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '18px' }}>star</span>
              ))}
            </div>
            <span className="text-sm font-semibold text-on-surface">{Number(medicine.rating).toFixed(1)}</span>
            <span className="text-sm text-on-surface-variant">({medicine.total_reviews} reviews)</span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-on-surface">NPR {Number(medicine.price).toFixed(0)}</span>
            {Number(medicine.original_price) > Number(medicine.price) && (
              <span className="text-base text-on-surface-variant line-through">NPR {Number(medicine.original_price).toFixed(0)}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${medicine.in_stock ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>{medicine.in_stock ? 'check_circle' : 'cancel'}</span>
              {medicine.in_stock ? 'In Stock' : 'Out of Stock'}
            </span>
            {isRx && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>medical_services</span>
                Prescription Required
              </span>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs text-on-surface-variant font-medium">Quantity</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-outline-variant rounded-xl overflow-hidden">
                <button onClick={() => { const next = Math.max(1, qty - 1); setQty(next); setQtyInput(String(next)) }} disabled={qty <= 1}
                  className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove</span>
                </button>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={qtyInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '')
                    setQtyInput(val)
                    if (val === '') return
                    const n = parseInt(val, 10)
                    if (!Number.isNaN(n) && n >= 1) setQty(n)
                  }}
                  onBlur={() => {
                    const n = parseInt(qtyInput, 10)
                    const clamped = Number.isNaN(n) || n < 1 ? 1 : n
                    setQty(clamped)
                    setQtyInput(String(clamped))
                  }}
                  className="w-14 text-center text-sm font-bold text-on-surface bg-transparent outline-none"
                />
                <button onClick={() => { const next = qty + 1; setQty(next); setQtyInput(String(next)) }}
                  className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                </button>
              </div>
              <span className="text-sm font-bold text-on-surface">NPR {(Number(medicine.price) * qty).toFixed(0)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleAddToCart} disabled={!medicine.in_stock || cartLoading}
              className="flex-1 py-3 border-2 border-primary text-primary text-sm font-bold rounded-2xl hover:bg-primary/5 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {cartLoading ? (
                <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Adding...</>
              ) : (
                <><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_shopping_cart</span>Add to Cart</>
              )}
            </button>
            <button onClick={handleBuyNow} disabled={!medicine.in_stock}
              className="flex-1 py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>bolt</span>Buy Now
            </button>
            <button onClick={handleWishlist}
              className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-colors ${inWish ? 'border-error bg-error/10 text-error' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              <span className={`material-symbols-outlined ${inWish ? 'ms-filled' : ''}`} style={{ fontSize: '20px' }}>favorite</span>
            </button>
          </div>

          {medicine.has_purchased ? (
            <div className="flex items-center gap-2 pt-2 border-t border-outline-variant">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>autorenew</span>
              <span className="text-xs font-medium text-on-surface flex-shrink-0">Never run out —</span>
              <select value={subFrequency} onChange={(e) => setSubFrequency(Number(e.target.value))}
                className="text-xs border border-outline-variant rounded-lg px-2 py-1.5 bg-surface text-on-surface focus:outline-none focus:border-secondary transition flex-1">
                {FREQUENCIES.map((f) => <option key={f.val} value={f.val}>{f.label}</option>)}
              </select>
              <button onClick={handleSubscribe} disabled={subscribing}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-60 whitespace-nowrap">
                {subscribing ? 'Setting up...' : 'Subscribe'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-2 border-t border-outline-variant text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>lock</span>
              <span className="text-xs">Buy this medicine once to unlock auto-refill subscriptions.</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="flex border-b border-outline-variant">
          {(['details', 'reviews'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {t === 'details' ? 'Details & Info' : `Reviews (${reviews.length})`}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'details' ? (
            <div className="space-y-4">
              {medicine.description && (
                <div>
                  <h3 className="text-sm font-bold text-on-surface mb-2">Description</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{medicine.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Brand', value: medicine.brand?.name },
                  { label: 'Dosage', value: (medicine as any).dosage },
                  { label: 'Package Size', value: (medicine as any).package_size },
                  { label: 'Manufacturer', value: (medicine as any).manufacturer || medicine.brand?.manufacturer },
                  { label: 'Type', value: medicine.type },
                ].filter((f) => f.value).map((field) => (
                  <div key={field.label} className="bg-surface-container-low rounded-xl p-3">
                    <p className="text-xs text-on-surface-variant">{field.label}</p>
                    <p className="text-sm font-medium text-on-surface mt-0.5">{field.value}</p>
                  </div>
                ))}
              </div>
              {(medicine as any).usage && (
                <div>
                  <h3 className="text-sm font-bold text-on-surface mb-2">Usage / Directions</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{(medicine as any).usage}</p>
                </div>
              )}
              {(medicine as any).side_effects && (
                <div className="bg-error/5 border border-error/20 rounded-xl p-4">
                  <p className="text-sm font-semibold text-error mb-1">Side Effects</p>
                  <p className="text-xs text-on-surface-variant">{(medicine as any).side_effects}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {user && (
                <form onSubmit={handleReviewSubmit} className="bg-surface-container-low rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-on-surface">{myExistingReview ? 'Edit Your Review' : 'Write a Review'}</p>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((n) => (
                      <button key={n} type="button" onClick={() => setMyRating(n)}>
                        <span className={`material-symbols-outlined ${n <= myRating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '22px' }}>star</span>
                      </button>
                    ))}
                  </div>
                  <textarea value={myReview} onChange={(e) => setMyReview(e.target.value)} rows={3}
                    placeholder="Share your experience with this medicine..."
                    className="w-full px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                  <div className="flex items-center gap-2">
                    <button type="submit" disabled={reviewLoading || !myReview.trim()}
                      className="px-5 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                      {reviewLoading ? 'Saving...' : myExistingReview ? 'Update Review' : 'Submit Review'}
                    </button>
                    {myExistingReview && (
                      <button type="button" onClick={handleReviewDelete} disabled={deletingReview}
                        className="px-5 py-2 border border-error/30 text-error text-sm font-semibold rounded-xl hover:bg-error/10 transition-colors disabled:opacity-60">
                        {deletingReview ? 'Deleting...' : 'Delete Review'}
                      </button>
                    )}
                  </div>
                </form>
              )}
              {reviews.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-6">No reviews yet. Be the first to review!</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((rev) => (
                    <div key={rev.id} className={`border rounded-2xl p-4 space-y-2 ${(rev as any).is_mine ? 'border-primary/40 bg-primary/[0.03]' : 'border-outline-variant'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{(rev as any).user?.full_name?.[0] || 'U'}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface">{(rev as any).user?.full_name || 'User'}</p>
                            <p className="text-xs text-on-surface-variant">{new Date(rev.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className={`material-symbols-outlined ${i < rev.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
                          ))}
                        </div>
                      </div>
                      {rev.comment && <p className="text-sm text-on-surface-variant">{rev.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
