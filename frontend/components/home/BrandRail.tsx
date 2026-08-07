'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Brand } from '@/types'

export const BRAND_COLORS = [
  'bg-primary/10 text-primary',
  'bg-secondary/10 text-secondary',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-rose-50 text-rose-600',
  'bg-indigo-50 text-indigo-600',
  'bg-cyan-50 text-cyan-600',
  'bg-purple-50 text-purple-600',
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

export default function BrandRail() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/medicines/brands/').then((r) => setBrands(r.data.data.brands || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (!loading && brands.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-on-surface">Featured Brands</h2>
        <Link href="/brands" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">Pick from our favourite brands</p>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <TileSkeleton key={i} />)
          : brands.map((brand, i) => (
            <Link key={brand.id} href={`/medicines?brand=${encodeURIComponent(brand.name)}`}
              className="flex flex-col items-center gap-2 w-20 sm:w-24 flex-shrink-0 group">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${BRAND_COLORS[i % BRAND_COLORS.length]} group-hover:scale-105 transition-transform`}>
                {brandInitials(brand.name)}
              </div>
              <p className="text-xs font-medium text-on-surface text-center leading-snug line-clamp-2">{brand.name}</p>
            </Link>
          ))
        }
      </div>
    </section>
  )
}
