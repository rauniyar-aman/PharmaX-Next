'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import CarouselRow from '@/components/common/CarouselRow'
import type { Brand } from '@/types'

// Fallback-only palette for the coloured-initials chip (brands with a real logo_url never use it,
// see BrandTile). Kept deliberately small — three brand-adjacent hues — so the page's text-colour
// set stays tight; tiles cycle through these by index.
export const BRAND_COLORS = [
  'bg-primary/10 text-primary',
  'bg-secondary/10 text-secondary',
  'bg-emerald-50 text-emerald-600',
]

export function brandInitials(brand: string) {
  return brand.trim().slice(0, 2).toUpperCase()
}

function TileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 w-20 sm:w-24 flex-shrink-0 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-surface-container" />
      <div className="h-3 w-14 bg-surface-container rounded" />
    </div>
  )
}

// Prefer the brand's real logo; fall back to the coloured initials chip when there's no logo_url
// or the image fails to load (broken/missing upload). Logos are contained on a plain surface disc
// so wide/tall marks aren't cropped, while the fallback keeps the original coloured-initials look.
function BrandTile({ brand, colorClass }: { brand: Brand; colorClass: string }) {
  const [imgError, setImgError] = useState(false)
  const logo = imgError ? null : resolveImg(brand.logo_url)
  return (
    <Link href={`/medicines?brand=${encodeURIComponent(brand.name)}`}
      className="flex flex-col items-center gap-2 w-20 sm:w-24 flex-shrink-0 group">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform ${logo ? 'bg-surface border border-outline-variant' : `text-lg font-bold ${colorClass}`}`}>
        {logo ? (
          <img src={logo} alt={brand.name} className="w-full h-full object-contain p-2" onError={() => setImgError(true)} />
        ) : (
          brandInitials(brand.name)
        )}
      </div>
      <p className="text-xs font-medium text-on-surface text-center leading-snug line-clamp-2">{brand.name}</p>
    </Link>
  )
}

export default function BrandRail() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/medicines/brands/').then((r) => setBrands(r.data.data.brands || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (!loading && brands.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg font-bold text-on-surface">Featured Brands</h2>
        <Link href="/brands" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">Pick from our favourite brands</p>
      <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel="brands">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <TileSkeleton key={i} />)
          : brands.slice(0, 12).map((brand, i) => (
            <BrandTile key={brand.id} brand={brand} colorClass={BRAND_COLORS[i % BRAND_COLORS.length]} />
          ))
        }
      </CarouselRow>
    </section>
  )
}
