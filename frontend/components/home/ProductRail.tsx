'use client'
import Link from 'next/link'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import type { Medicine } from '@/types'

interface Props {
  title: string
  medicines: Medicine[]
  loading?: boolean
  viewAllHref?: string
  wishlistIds: string[]
  onToggleWishlist: (id: string, e: React.MouseEvent) => void
  onAddToCart: (id: string, e: React.MouseEvent) => void
  cartLoading?: Record<string, boolean>
  badge?: (medicine: Medicine) => React.ReactNode
}

export default function ProductRail({
  title, medicines, loading, viewAllHref, wishlistIds, onToggleWishlist, onAddToCart, cartLoading = {}, badge,
}: Props) {
  if (!loading && medicines.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface">{title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
            View All
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
          </Link>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-44 sm:w-52 flex-shrink-0"><MedicineCardSkeleton /></div>
          ))
          : medicines.map((med) => (
            <div key={med.id} className="w-44 sm:w-52 flex-shrink-0">
              <MedicineCard
                medicine={med}
                inWishlist={wishlistIds.includes(med.id)}
                cartLoading={cartLoading[med.id]}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={onAddToCart}
                badge={badge ? badge(med) : undefined}
              />
            </div>
          ))
        }
      </div>
    </section>
  )
}
