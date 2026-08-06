'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import type { Medicine, Category } from '@/types'

const LIMIT = 12

function Skeleton() {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-outline-variant animate-pulse">
      <div className="h-44 bg-surface-container" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-surface-container rounded w-1/3" />
        <div className="h-4 bg-surface-container rounded w-3/4" />
        <div className="h-3 bg-surface-container rounded w-1/2" />
        <div className="h-8 bg-surface-container rounded mt-3" />
      </div>
    </div>
  )
}

export default function MedicinesPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle } = useWishlist()
  const { addToCart } = useCart()

  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [availability, setAvailability] = useState('')
  const [sortBy, setSortBy] = useState('popular')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {})
  }, [])

  const fetchMedicines = useCallback(() => {
    setLoading(true)
    const params: Record<string, any> = { sortBy, page, limit: LIMIT }
    if (search) params.search = search
    if (category) params.category = category
    if (priceRange === 'under-100') params.maxPrice = 99
    if (priceRange === '100-300') { params.minPrice = 100; params.maxPrice = 300 }
    if (priceRange === 'over-300') params.minPrice = 301
    if (availability === 'in-stock') params.inStock = 'true'
    if (availability === 'out-of-stock') params.inStock = 'false'
    api.get('/medicines/', { params })
      .then((r) => {
        setMedicines(r.data.data.medicines || [])
        setTotal(r.data.data.pagination?.total || 0)
        setTotalPages(r.data.data.pagination?.totalPages || 1)
      })
      .catch(() => toast.error('Failed to load medicines.'))
      .finally(() => setLoading(false))
  }, [search, category, priceRange, availability, sortBy, page])

  useEffect(() => { fetchMedicines() }, [fetchMedicines])

  const handleAddToCart = async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!user) { router.push('/signin'); return }
    setCartLoading((p) => ({ ...p, [medId]: true }))
    try {
      await addToCart(medId, 1)
      toast.success('Added to cart!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not add to cart.')
    } finally {
      setCartLoading((p) => ({ ...p, [medId]: false }))
    }
  }

  const handleWishlist = async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!user) { router.push('/signin'); return }
    await toggle(medId)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-2xl p-4">
          <span className="material-symbols-outlined ms-filled text-primary mt-0.5" style={{ fontSize: '22px' }}>medical_services</span>
          <div>
            <p className="text-sm font-semibold text-primary">Prescription Required (Rx)</p>
            <p className="text-xs text-on-surface-variant mt-0.5">These medicines require a valid doctor's prescription at checkout.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-secondary/5 border border-secondary/20 rounded-2xl p-4">
          <span className="material-symbols-outlined ms-filled text-secondary mt-0.5" style={{ fontSize: '22px' }}>local_pharmacy</span>
          <div>
            <p className="text-sm font-semibold text-secondary">Over the Counter (OTC)</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Available for immediate checkout without a prescription.</p>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input
            type="text"
            placeholder="Search medicines by name or brand..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}
            className="text-sm border border-outline-variant rounded-xl px-3 py-2 bg-surface text-on-surface focus:outline-none focus:border-secondary min-w-[140px]">
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={priceRange} onChange={(e) => { setPriceRange(e.target.value); setPage(1) }}
            className="text-sm border border-outline-variant rounded-xl px-3 py-2 bg-surface text-on-surface focus:outline-none focus:border-secondary min-w-[130px]">
            <option value="">All Prices</option>
            <option value="under-100">Under NPR 100</option>
            <option value="100-300">NPR 100–300</option>
            <option value="over-300">Over NPR 300</option>
          </select>
          <select value={availability} onChange={(e) => { setAvailability(e.target.value); setPage(1) }}
            className="text-sm border border-outline-variant rounded-xl px-3 py-2 bg-surface text-on-surface focus:outline-none focus:border-secondary min-w-[130px]">
            <option value="">Availability</option>
            <option value="in-stock">In Stock</option>
            <option value="out-of-stock">Out of Stock</option>
          </select>
          <div className="ml-auto flex items-center gap-1 bg-surface-container-low rounded-xl p-1">
            {[{ val: 'popular', label: 'Popular' }, { val: 'price-asc', label: 'Price: Low' }, { val: 'newest', label: 'Newest' }].map((opt) => (
              <button key={opt.val} onClick={() => { setSortBy(opt.val); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy === opt.val ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-on-surface-variant">{total} results</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: LIMIT }).map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : medicines.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>search_off</span>
          <p className="text-base font-medium text-on-surface mt-3">No medicines found</p>
          <p className="text-sm text-on-surface-variant mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {medicines.map((med) => {
            const isRx = med.type === 'Rx'
            const inWish = wishlistIds.includes(med.id)
            return (
              <div key={med.id} className="bg-surface rounded-2xl border border-outline-variant overflow-hidden hover:-translate-y-1 transition-all duration-200 flex flex-col group">
                <Link href={`/medicines/${med.id}`} className="relative block overflow-hidden">
                  {med.image_url ? (
                    <img src={med.image_url} alt={med.name} className="h-44 w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="h-44 w-full bg-surface-container-low flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-5xl opacity-30">medication</span>
                      <span className="text-xs opacity-40">No image</span>
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${isRx ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}>
                    {med.type}
                  </span>
                  <button onClick={(e) => handleWishlist(med.id, e)}
                    className="absolute top-3 right-3 w-8 h-8 bg-surface rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
                    <span className={`material-symbols-outlined ${inWish ? 'ms-filled text-error' : 'text-on-surface-variant'}`} style={{ fontSize: '18px' }}>favorite</span>
                  </button>
                  {!med.in_stock && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="bg-error text-on-error text-xs font-bold px-3 py-1.5 rounded-full">Out of Stock</span>
                    </div>
                  )}
                </Link>
                <div className="p-4 flex flex-col flex-1">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">{(med as any).category_name || (med.category as any)?.name}</p>
                  <Link href={`/medicines/${med.id}`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors leading-snug">{med.name}</Link>
                  <div className="flex items-center gap-1 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`material-symbols-outlined ${i < Math.floor(Number(med.rating)) ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
                    ))}
                    <span className="text-xs text-on-surface-variant ml-1">({med.total_reviews})</span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-base font-bold text-on-surface">NPR {Number(med.price).toFixed(0)}</span>
                    {Number(med.original_price) > Number(med.price) && (
                      <span className="text-xs text-on-surface-variant line-through">NPR {Number(med.original_price).toFixed(0)}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant">
                    <Link href={`/medicines/${med.id}`}
                      className="flex-1 py-2 border border-outline-variant rounded-xl text-sm font-medium text-on-surface text-center hover:border-primary hover:text-primary transition-colors">
                      Details
                    </Link>
                    <button disabled={!med.in_stock || cartLoading[med.id]}
                      onClick={(e) => handleAddToCart(med.id, e)}
                      className={`px-3 py-2 rounded-xl transition-colors flex items-center justify-center ${med.in_stock ? 'bg-primary text-on-primary hover:opacity-90' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'} disabled:opacity-60`}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                        {cartLoading[med.id] ? 'hourglass_empty' : 'add_shopping_cart'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          {[...Array(Math.min(totalPages, 7))].map((_, i) => (
            <button key={i + 1} onClick={() => setPage(i + 1)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}
