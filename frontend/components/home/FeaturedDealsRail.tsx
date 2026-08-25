'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import ServiceDealCard from '@/components/offers/ServiceDealCard'
import type { FeaturedDeal } from '@/types'

interface Props {
  wishlistIds: string[]
  onToggleWishlist: (id: string, e: React.MouseEvent) => void
  onAddToCart: (id: string, e: React.MouseEvent) => void
  cartLoading?: Record<string, boolean>
}

export default function FeaturedDealsRail({ wishlistIds, onToggleWishlist, onAddToCart, cartLoading = {} }: Props) {
  const [deals, setDeals] = useState<FeaturedDeal[]>([])
  const [loading, setLoading] = useState(true)

  // The same GET /offers/ endpoint the real offers page reads from — only the coupons half of
  // that response is unused here, since this rail is specifically the featured-deals promo strip.
  useEffect(() => {
    api.get('/offers/')
      .then((r) => setDeals(r.data.data.featured_deals || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && deals.length === 0) return null

  const medicineDeals = deals.filter((d) => d.target_type === 'MEDICINE' && d.medicine)
  const serviceDeals = deals.filter((d) => d.target_type !== 'MEDICINE')

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface">Featured Deals</h2>
        <Link href="/offers" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-44 sm:w-52 flex-shrink-0"><MedicineCardSkeleton /></div>
          ))
        ) : (
          <>
            {medicineDeals.map((d) => (
              <div key={d.id} className="w-44 sm:w-52 flex-shrink-0">
                <MedicineCard
                  medicine={d.medicine!}
                  inWishlist={wishlistIds.includes(d.medicine!.id)}
                  cartLoading={cartLoading[d.medicine!.id]}
                  onToggleWishlist={onToggleWishlist}
                  onAddToCart={onAddToCart}
                  badge={d.badge_text ? (
                    <span className="block bg-error text-on-error text-[10px] font-bold text-center py-1">{d.badge_text}</span>
                  ) : undefined}
                />
              </div>
            ))}
            {serviceDeals.map((d) => (
              <div key={d.id} className="w-52 flex-shrink-0">
                <ServiceDealCard deal={d} className="h-full" />
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
