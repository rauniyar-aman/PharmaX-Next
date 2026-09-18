'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import CarouselRow from '@/components/common/CarouselRow'
import type { Category } from '@/types'

const ICONS = ['medication', 'heart_plus', 'vaccines', 'medical_services', 'health_and_safety', 'science', 'healing', 'pediatrics', 'psychology', 'ophthalmology', 'dentistry', 'dermatology']
// One brand tint for every tile, because the eight-hue rotation this replaces was telling you
// nothing: a category isn't emerald or rose, and the wheel restarted every ninth tile, so the
// colour didn't even identify a category consistently. The icon is what says "vitamins" or
// "devices", and colour is now reserved for state — green done, amber due, red needs you.
const TILE_TINT = 'bg-primary/10 text-primary'

function TileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 w-20 sm:w-24 flex-shrink-0 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-surface-container" />
      <div className="h-3 w-14 bg-surface-container rounded" />
    </div>
  )
}

export default function CategoryRail() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (!loading && categories.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-bold text-on-surface">Shop by Category</h2>
        <Link href="/categories" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel="categories">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <TileSkeleton key={i} />)
          : categories.map((cat, i) => (
            <Link key={cat.id} href={`/medicines?category=${encodeURIComponent(cat.name)}`}
              className="flex flex-col items-center gap-2 w-20 sm:w-24 flex-shrink-0 group">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${TILE_TINT} group-hover:scale-105 transition-transform`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '28px' }}>{cat.icon || ICONS[i % ICONS.length]}</span>
              </div>
              <p className="text-xs font-medium text-on-surface text-center leading-snug line-clamp-2">{cat.name}</p>
            </Link>
          ))
        }
      </CarouselRow>
    </div>
  )
}
