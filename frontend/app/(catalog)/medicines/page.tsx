'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import type { Medicine, Category } from '@/types'

const LIMIT = 12

export default function MedicinesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle } = useWishlist()
  const { addToCart } = useCart()

  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [priceRange, setPriceRange] = useState('')
  const [availability, setAvailability] = useState('')
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'popular')
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
          {Array.from({ length: LIMIT }).map((_, i) => <MedicineCardSkeleton key={i} />)}
        </div>
      ) : medicines.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>search_off</span>
          <p className="text-base font-medium text-on-surface mt-3">No medicines found</p>
          <p className="text-sm text-on-surface-variant mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {medicines.map((med) => (
            <MedicineCard
              key={med.id}
              medicine={med}
              inWishlist={wishlistIds.includes(med.id)}
              cartLoading={cartLoading[med.id]}
              onToggleWishlist={handleWishlist}
              onAddToCart={handleAddToCart}
            />
          ))}
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
