'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useCart } from '@/hooks/useCart'
import { resolveImg } from '@/lib/resolveImg'
import type { Medicine } from '@/types'

export default function WishlistPage() {
  const [items, setItems] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})
  const { addToCart } = useCart()

  useEffect(() => {
    api.get('/wishlist/')
      .then((r) => setItems(r.data.data.wishlist || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const remove = async (medId: string) => {
    setItems((p) => p.filter((m) => m.id !== medId))
    try { await api.delete(`/wishlist/${medId}/`) }
    catch { api.get('/wishlist/').then((r) => setItems(r.data.data.wishlist || [])) }
  }

  const handleAddToCart = async (medId: string) => {
    setCartLoading((p) => ({ ...p, [medId]: true }))
    try { await addToCart(medId, 1); toast.success('Added to cart!') }
    catch { toast.error('Could not add to cart.') }
    finally { setCartLoading((p) => ({ ...p, [medId]: false })) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!items.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>favorite</span>
      <h2 className="text-xl font-bold text-on-surface">Your wishlist is empty</h2>
      <p className="text-sm text-on-surface-variant">Save medicines you like by tapping the heart icon</p>
      <Link href="/medicines" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Browse Medicines
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Wishlist</h1>
        <span className="text-sm text-on-surface-variant">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
        {items.map((med) => (
          <div key={med.id} className="bg-surface rounded-2xl border border-outline-variant overflow-hidden flex flex-col hover:-translate-y-1 transition-all duration-200">
            <Link href={`/medicines/${med.id}`} className="relative block overflow-hidden">
              {med.image_url ? (
                <img src={resolveImg(med.image_url) || undefined} alt={med.name} className="h-44 w-full object-cover" />
              ) : (
                <div className="h-44 w-full bg-surface-container-low flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-on-surface-variant opacity-30">medication</span>
                </div>
              )}
              <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${med.type === 'Rx' ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}>
                  {med.type}
                </span>
                {med.promo_badge && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500 text-white">
                    {med.promo_badge}
                  </span>
                )}
              </div>
            </Link>
            <div className="p-4 flex flex-col flex-1">
              <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wide">{(med as any).category_name}</p>
              <Link href={`/medicines/${med.id}`} className="text-sm font-semibold text-on-surface hover:text-primary mt-1 leading-snug">{med.name}</Link>
              <p className="text-xs text-on-surface-variant mt-0.5">{med.brand_name}</p>
              <p className="text-base font-bold text-on-surface mt-2">NPR {Number(med.price).toFixed(0)}</p>
              <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant">
                <button onClick={() => handleAddToCart(med.id)} disabled={!med.in_stock || cartLoading[med.id]}
                  className="flex-1 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  {cartLoading[med.id] ? '...' : med.in_stock ? 'Add to Cart' : 'Out of Stock'}
                </button>
                <button onClick={() => remove(med.id)} className="px-3 py-2 border border-outline-variant text-error rounded-xl hover:bg-error/10 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
