'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import CountdownBadge from '@/components/home/CountdownBadge'
import type { Medicine } from '@/types'

// Same fetch shape ProductRail's four call sites on the homepage used to build independently
// (sortBy=newest/price-asc/rating, or a category filter for wellness) — consolidated here so both
// the homepage and the customer dashboard (Stage 6) share one tabbed rail instead of each keeping
// its own copy of this data-fetching logic.
function useMedicineRail(params: Record<string, any>) {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get('/medicines/', { params })
      .then((r) => { if (active) setMedicines(r.data.data.medicines || []) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)])

  return { medicines, loading }
}

function discountPct(m: Medicine) {
  const price = Number(m.price)
  const original = Number(m.original_price)
  if (!original || original <= price) return 0
  return (original - price) / original
}

const TABS = [
  { key: 'new', label: 'New Launches', viewAllHref: '/medicines?sortBy=newest' },
  { key: 'deals', label: 'Deals of the Day', viewAllHref: '/medicines?sortBy=price-asc' },
  { key: 'top', label: 'Top Rated', viewAllHref: '/medicines?sortBy=rating' },
  { key: 'wellness', label: 'Wellness Essentials', viewAllHref: '/medicines?category=Health+Food+and+Drinks' },
] as const
type TabKey = typeof TABS[number]['key']

interface Props {
  wishlistIds: string[]
  onToggleWishlist: (id: string, e: React.MouseEvent) => void
  onAddToCart: (id: string, e: React.MouseEvent) => void
  cartLoading?: Record<string, boolean>
}

export default function TabbedProductRail({ wishlistIds, onToggleWishlist, onAddToCart, cartLoading = {} }: Props) {
  const [tab, setTab] = useState<TabKey>(TABS[0].key)

  const { medicines: newLaunches, loading: newLoading } = useMedicineRail({ sortBy: 'newest', limit: 10 })
  const { medicines: dealsPool, loading: dealsLoading } = useMedicineRail({ sortBy: 'price-asc', limit: 30 })
  const { medicines: topRated, loading: topLoading } = useMedicineRail({ sortBy: 'rating', limit: 10 })
  const { medicines: wellness, loading: wellnessLoading } = useMedicineRail({ category: 'Health Food and Drinks', limit: 10 })

  const deals = [...dealsPool].sort((a, b) => discountPct(b) - discountPct(a)).slice(0, 10)

  const byTab: Record<TabKey, { medicines: Medicine[]; loading: boolean }> = {
    new: { medicines: newLaunches, loading: newLoading },
    deals: { medicines: deals, loading: dealsLoading },
    top: { medicines: topRated, loading: topLoading },
    wellness: { medicines: wellness, loading: wellnessLoading },
  }

  const active = TABS.find((t) => t.key === tab)!
  const { medicines, loading } = byTab[tab]

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-surface-container-low rounded-xl p-1 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${tab === t.key ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Link href={active.viewAllHref} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 flex-shrink-0">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-44 sm:w-52 flex-shrink-0"><MedicineCardSkeleton /></div>
          ))
        ) : medicines.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-6">Nothing here right now — check back soon.</p>
        ) : medicines.map((med) => (
          <div key={med.id} className="w-44 sm:w-52 flex-shrink-0">
            <MedicineCard
              medicine={med}
              inWishlist={wishlistIds.includes(med.id)}
              cartLoading={cartLoading[med.id]}
              onToggleWishlist={onToggleWishlist}
              onAddToCart={onAddToCart}
              badge={tab === 'deals' ? <CountdownBadge /> : undefined}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
