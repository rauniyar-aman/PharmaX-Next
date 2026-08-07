'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import type { Medicine, Category, Brand } from '@/types'

const PAGE_SIZE_OPTIONS = [20, 60, 100]

const PRICE_RANGES = [
  { val: 'under-100', label: 'Under NPR 100' },
  { val: '100-300', label: 'NPR 100 – 300' },
  { val: 'over-300', label: 'Over NPR 300' },
]

const AVAILABILITY_OPTIONS = [
  { val: 'in-stock', label: 'In Stock' },
  { val: 'out-of-stock', label: 'Out of Stock' },
]

const RATING_OPTIONS = [4, 3, 2, 1]

const TYPE_OPTIONS = [
  { val: 'Rx', label: 'Rx: needs prescription', icon: 'medical_services', color: 'primary' as const },
  { val: 'OTC', label: 'OTC: no prescription needed', icon: 'local_pharmacy', color: 'secondary' as const },
]

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function CheckboxRow({ checked, label, onClick }: { checked: boolean; label: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors ${checked ? 'bg-primary/10 text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-low'}`}>
      <span className="material-symbols-outlined ms-filled flex-shrink-0" style={{ fontSize: '18px' }}>
        {checked ? 'check_box' : 'check_box_outline_blank'}
      </span>
      {label}
    </button>
  )
}

export default function MedicinesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle } = useWishlist()
  const { addToCart } = useCart()

  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get('category') ? [searchParams.get('category') as string] : []
  )
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.get('brand') ? [searchParams.get('brand') as string] : []
  )
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([])
  const [selectedAvailability, setSelectedAvailability] = useState<string[]>([])
  const [selectedRatings, setSelectedRatings] = useState<number[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'popular')
  const [page, setPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {})
    api.get('/medicines/brands/').then((r) => setBrands(r.data.data.brands || [])).catch(() => {})
  }, [])

  const fetchMedicines = useCallback(() => {
    setLoading(true)
    const params: Record<string, any> = { sortBy, page, limit: itemsPerPage }
    if (search) params.search = search
    if (selectedCategories.length) params.category = selectedCategories.join(',')
    if (selectedBrands.length) params.brand = selectedBrands.join(',')
    if (selectedPriceRanges.length) params.priceRanges = selectedPriceRanges.join(',')
    if (selectedAvailability.length) params.availability = selectedAvailability.join(',')
    if (selectedRatings.length) params.minRating = Math.min(...selectedRatings)
    if (selectedTypes.length) params.type = selectedTypes.join(',')
    api.get('/medicines/', { params })
      .then((r) => {
        setMedicines(r.data.data.medicines || [])
        setTotal(r.data.data.pagination?.total || 0)
        setTotalPages(r.data.data.pagination?.totalPages || 1)
      })
      .catch(() => toast.error('Failed to load medicines.'))
      .finally(() => setLoading(false))
  }, [search, selectedCategories, selectedBrands, selectedPriceRanges, selectedAvailability, selectedRatings, selectedTypes, sortBy, page, itemsPerPage])

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

  const activeFilterCount = selectedCategories.length + selectedBrands.length + selectedPriceRanges.length + selectedAvailability.length + selectedRatings.length + selectedTypes.length

  const clearFilters = () => {
    setSelectedCategories([])
    setSelectedBrands([])
    setSelectedPriceRanges([])
    setSelectedAvailability([])
    setSelectedRatings([])
    setSelectedTypes([])
    setPage(1)
  }

  const FilterSections = (
    <>
      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Category</p>
        <div className="space-y-1">
          {categories.map((c) => (
            <CheckboxRow key={c.id} checked={selectedCategories.includes(c.name)} label={c.name}
              onClick={() => { setSelectedCategories((p) => toggleValue(p, c.name)); setPage(1) }} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Brand</p>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {brands.map((b) => (
            <CheckboxRow key={b.id} checked={selectedBrands.includes(b.name)}
              label={<span>{b.name} <span className="text-xs text-on-surface-variant">({b.medicine_count})</span></span>}
              onClick={() => { setSelectedBrands((p) => toggleValue(p, b.name)); setPage(1) }} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Price</p>
        <div className="space-y-1">
          {PRICE_RANGES.map((p) => (
            <CheckboxRow key={p.val} checked={selectedPriceRanges.includes(p.val)} label={p.label}
              onClick={() => { setSelectedPriceRanges((prev) => toggleValue(prev, p.val)); setPage(1) }} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Rating</p>
        <div className="space-y-1">
          {RATING_OPTIONS.map((r) => (
            <CheckboxRow key={r} checked={selectedRatings.includes(r)}
              label={
                <span className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`material-symbols-outlined ${i < r ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
                  ))}
                  <span className="ml-0.5">&amp; up</span>
                </span>
              }
              onClick={() => { setSelectedRatings((prev) => toggleValue(prev, r)); setPage(1) }} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Availability</p>
        <div className="space-y-1">
          {AVAILABILITY_OPTIONS.map((a) => (
            <CheckboxRow key={a.val} checked={selectedAvailability.includes(a.val)} label={a.label}
              onClick={() => { setSelectedAvailability((prev) => toggleValue(prev, a.val)); setPage(1) }} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-2.5">Type</p>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((t) => {
            const checked = selectedTypes.includes(t.val)
            return (
              <button key={t.val} onClick={() => { setSelectedTypes((prev) => toggleValue(prev, t.val)); setPage(1) }}
                className={`flex items-start gap-2 text-left rounded-xl p-2.5 border transition-colors ${
                  checked
                    ? t.color === 'primary' ? 'bg-primary/10 border-primary' : 'bg-secondary/10 border-secondary'
                    : t.color === 'primary' ? 'bg-primary/5 border-primary/20 hover:bg-primary/10' : 'bg-secondary/5 border-secondary/20 hover:bg-secondary/10'
                }`}>
                <span className={`material-symbols-outlined ms-filled flex-shrink-0 ${t.color === 'primary' ? 'text-primary' : 'text-secondary'}`} style={{ fontSize: '18px' }}>
                  {checked ? 'check_box' : t.icon}
                </span>
                <p className={`text-[11px] font-medium leading-snug ${t.color === 'primary' ? 'text-primary' : 'text-secondary'}`}>{t.label}</p>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )

  return (
    <div className="flex items-start gap-5">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-[7.5rem] bg-surface rounded-2xl border border-outline-variant p-4 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-on-surface">Filters</p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">Clear all</button>
          )}
        </div>
        {FilterSections}
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
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
            <button onClick={() => setMobileFiltersOpen((o) => !o)}
              className="lg:hidden flex items-center gap-1.5 text-sm font-medium border border-outline-variant rounded-xl px-3 py-2 text-on-surface hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>tune</span>
              Filters
              {activeFilterCount > 0 && (
                <span className="w-4.5 h-4.5 bg-primary text-on-primary text-[10px] font-bold rounded-full flex items-center justify-center px-1">{activeFilterCount}</span>
              )}
            </button>
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

          {mobileFiltersOpen && (
            <div className="lg:hidden space-y-5 pt-3 border-t border-outline-variant">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-on-surface">Filters</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">Clear all</button>
                )}
              </div>
              {FilterSections}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => <MedicineCardSkeleton key={i} />)}
          </div>
        ) : medicines.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>search_off</span>
            <p className="text-base font-medium text-on-surface mt-3">No medicines found</p>
            <p className="text-sm text-on-surface-variant mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
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

        {total > 0 && (
          <div className="flex items-center justify-end gap-4 pt-2 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-on-surface-variant">Items per page:</label>
              <div className="relative">
                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setPage(1) }}
                  className="text-sm border border-outline-variant rounded-lg pl-2.5 pr-7 py-1.5 bg-surface text-on-surface focus:outline-none focus:border-secondary appearance-none transition">
                  {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" style={{ fontSize: '16px' }}>arrow_drop_down</span>
              </div>
            </div>

            <span className="text-sm text-on-surface-variant">
              {(page - 1) * itemsPerPage + 1}–{Math.min(page * itemsPerPage, total)} of {total}
            </span>

            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} title="First page"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>first_page</span>
              </button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} title="Previous page"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="Next page"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} title="Last page"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>last_page</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
