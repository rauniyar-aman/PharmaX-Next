'use client'
import { useState } from 'react'
import Link from 'next/link'
import { resolveImg } from '@/lib/resolveImg'
import { productPhoto } from '@/lib/demoImages'
import DeliveryTierBadge from '@/components/medicine/DeliveryTierBadge'
import type { Medicine } from '@/types'

export function MedicineCardSkeleton() {
  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-outline-variant animate-pulse">
      <div className="h-36 bg-surface-container" />
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
  // Every card shows a photo: the real product image when it exists, otherwise a topical demo photo
  // keyed off the product's category (see lib/demoImages) — so the storefront never falls back to a
  // bare "no image" placeholder. If a real image URL fails to load we drop to the same demo photo.
  const [imgError, setImgError] = useState(false)
  const realSrc = resolveImg(med.image_url)
  const imgSrc = imgError || !realSrc ? productPhoto(med) : realSrc
  // Savings, shown as a green "X% OFF" flag on the image (hidden below 5% to avoid a noisy "1% OFF").
  const price = Number(med.price)
  const original = Number(med.original_price)
  const discount = original > price ? Math.round(((original - price) / original) * 100) : 0
  return (
    <div className={`bg-surface rounded-xl border border-outline-variant overflow-hidden hover:-translate-y-0.5 transition-all duration-200 flex flex-col group ${className}`}>
      <Link href={`/medicines/${med.id}`} className="relative block overflow-hidden bg-surface-container">
        <img src={imgSrc} alt={med.name}
          onError={() => { if (!imgError) setImgError(true) }}
          className="h-36 w-full object-cover group-hover:scale-105 transition-transform duration-300" />
        {/* Badges stack top-left (Rx status wins for safety, then promo, then delivery tier), with the
            savings flag below them — PharmEasy-style — so nothing overlaps the wishlist button. */}
        <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
          {isRx ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-on-primary">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>prescriptions</span>
              Rx
            </span>
          ) : med.promo_badge ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>sell</span>
              {med.promo_badge}
            </span>
          ) : (
            <DeliveryTierBadge tier={med.delivery_tier} className="px-1.5 py-0.5 text-[10px]" />
          )}
          {discount >= 5 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-white shadow-sm">
              {discount}% OFF
            </span>
          )}
        </div>
        <button onClick={(e) => onToggleWishlist(med.id, e)}
          className="absolute top-1.5 right-1.5 w-6 h-6 bg-surface rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
          <span className={`material-symbols-outlined ${inWishlist ? 'ms-filled text-error' : 'text-on-surface-variant'}`} style={{ fontSize: '12px' }}>favorite</span>
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
      <div className="p-2.5 pb-3 flex flex-col flex-1">
        <p title={(med as any).category_name || (med.category as any)?.name}
          className="text-[10px] font-semibold text-on-surface-variant tracking-wide truncate">{(med as any).category_name || (med.category as any)?.name}</p>
        <Link href={`/medicines/${med.id}`} className="text-xs font-semibold text-on-surface hover:text-primary transition-colors leading-snug line-clamp-2 min-h-[2rem]">{med.name}</Link>
        <div className="flex items-center gap-1 mt-1">
          <span className="material-symbols-outlined ms-filled text-rating" style={{ fontSize: '12px' }}>star</span>
          <span className="text-xs font-medium text-on-surface">{Number(med.rating).toFixed(1)}</span>
          <span className="text-[10px] text-on-surface-variant">({med.total_reviews})</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-sm font-bold text-on-surface">NPR {Number(med.price).toFixed(0)}</span>
          {Number(med.original_price) > Number(med.price) && (
            <span className="text-[10px] text-on-surface-variant line-through">NPR {Number(med.original_price).toFixed(0)}</span>
          )}
        </div>
        {/* Whole card image + title already link to the detail page, so the footer is a single
            clear action instead of a Details link competing with the cart button. */}
        <button disabled={!med.in_stock || cartLoading}
          onClick={(e) => onAddToCart(med.id, e)}
          className={`btn btn-sm w-full mt-2.5 ${med.in_stock ? 'btn-primary' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'}`}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {cartLoading ? 'hourglass_empty' : 'add_shopping_cart'}
          </span>
          {med.in_stock ? 'Add to cart' : 'Unavailable'}
        </button>
      </div>
    </div>
  )
}
