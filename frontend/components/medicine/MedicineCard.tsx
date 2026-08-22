'use client'
import Link from 'next/link'
import { resolveImg } from '@/lib/resolveImg'
import type { Medicine } from '@/types'

export function MedicineCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-outline-variant animate-pulse">
      <div className="h-24 bg-surface-container" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-2.5 bg-surface-container rounded w-1/3" />
        <div className="h-3.5 bg-surface-container rounded w-3/4" />
        <div className="h-2.5 bg-surface-container rounded w-1/2" />
        <div className="h-7 bg-surface-container rounded mt-2" />
      </div>
    </div>
  )
}

interface Props {
  medicine: Medicine
  inWishlist: boolean
  cartLoading?: boolean
  onToggleWishlist: (id: string, e: React.MouseEvent) => void
  onAddToCart: (id: string, e: React.MouseEvent) => void
  badge?: React.ReactNode
  className?: string
}

export default function MedicineCard({ medicine: med, inWishlist, cartLoading, onToggleWishlist, onAddToCart, badge, className = '' }: Props) {
  const isRx = med.type === 'Rx'
  return (
    <div className={`bg-surface rounded-xl border border-outline-variant overflow-hidden hover:-translate-y-0.5 transition-all duration-200 flex flex-col group ${className}`}>
      <Link href={`/medicines/${med.id}`} className="relative block overflow-hidden">
        {med.image_url ? (
          <img src={resolveImg(med.image_url) || undefined} alt={med.name} className="h-24 w-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="h-24 w-full bg-surface-container-low flex flex-col items-center justify-center gap-1 text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl opacity-30">medication</span>
          </div>
        )}
        <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isRx ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'}`}>
          {med.type}
        </span>
        <button onClick={(e) => onToggleWishlist(med.id, e)}
          className="absolute top-1.5 right-1.5 w-6 h-6 bg-surface rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
          <span className={`material-symbols-outlined ${inWishlist ? 'ms-filled text-error' : 'text-on-surface-variant'}`} style={{ fontSize: '13px' }}>favorite</span>
        </button>
        {badge && (
          <div className="absolute bottom-0 left-0 right-0">{badge}</div>
        )}
        {!med.in_stock && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-error text-on-error text-[10px] font-bold px-2 py-1 rounded-full">Out of Stock</span>
          </div>
        )}
      </Link>
      <div className="p-2.5 flex flex-col flex-1">
        <p className="text-[9px] font-semibold text-on-surface-variant uppercase tracking-wide truncate">{(med as any).category_name || (med.category as any)?.name}</p>
        <Link href={`/medicines/${med.id}`} className="text-xs font-semibold text-on-surface hover:text-primary transition-colors leading-snug line-clamp-2 min-h-[2rem]">{med.name}</Link>
        <div className="flex items-center gap-0.5 mt-1">
          {[...Array(5)].map((_, i) => (
            <span key={i} className={`material-symbols-outlined ${i < Math.floor(Number(med.rating)) ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '11px' }}>star</span>
          ))}
          <span className="text-[10px] text-on-surface-variant ml-1">({med.total_reviews})</span>
        </div>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-sm font-bold text-on-surface">NPR {Number(med.price).toFixed(0)}</span>
          {Number(med.original_price) > Number(med.price) && (
            <span className="text-[10px] text-on-surface-variant line-through">NPR {Number(med.original_price).toFixed(0)}</span>
          )}
        </div>
        <div className="flex gap-1.5 mt-2 pt-2 border-t border-outline-variant">
          <Link href={`/medicines/${med.id}`}
            className="flex-1 py-1.5 border border-outline-variant rounded-lg text-[11px] font-medium text-on-surface text-center hover:border-primary hover:text-primary transition-colors">
            Details
          </Link>
          <button disabled={!med.in_stock || cartLoading}
            onClick={(e) => onAddToCart(med.id, e)}
            className={`px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center ${med.in_stock ? 'bg-primary text-on-primary hover:opacity-90' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'} disabled:opacity-60`}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              {cartLoading ? 'hourglass_empty' : 'add_shopping_cart'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
