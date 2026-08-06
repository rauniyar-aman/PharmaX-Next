'use client'
import Link from 'next/link'
import type { Medicine } from '@/types'

export function MedicineCardSkeleton() {
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
    <div className={`bg-surface rounded-2xl border border-outline-variant overflow-hidden hover:-translate-y-1 transition-all duration-200 flex flex-col group ${className}`}>
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
        <button onClick={(e) => onToggleWishlist(med.id, e)}
          className="absolute top-3 right-3 w-8 h-8 bg-surface rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
          <span className={`material-symbols-outlined ${inWishlist ? 'ms-filled text-error' : 'text-on-surface-variant'}`} style={{ fontSize: '18px' }}>favorite</span>
        </button>
        {badge && (
          <div className="absolute bottom-0 left-0 right-0">{badge}</div>
        )}
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
          <button disabled={!med.in_stock || cartLoading}
            onClick={(e) => onAddToCart(med.id, e)}
            className={`px-3 py-2 rounded-xl transition-colors flex items-center justify-center ${med.in_stock ? 'bg-primary text-on-primary hover:opacity-90' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'} disabled:opacity-60`}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {cartLoading ? 'hourglass_empty' : 'add_shopping_cart'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
