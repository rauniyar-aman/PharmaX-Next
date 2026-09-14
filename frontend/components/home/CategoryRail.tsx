'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import CarouselRow from '@/components/common/CarouselRow'
import type { Category } from '@/types'

const ICONS = ['medication', 'heart_plus', 'vaccines', 'medical_services', 'health_and_safety', 'science', 'healing', 'pediatrics', 'psychology', 'ophthalmology', 'dentistry', 'dermatology']
// A rotating colour palette so the category tiles read as a colourful, graphic shortcut grid
// (Flipkart/PharmEasy style) rather than a flat monochrome list. The /10 tints + dark: text stay
// legible in both themes. (This deliberately replaces the earlier "reserve colour for one section"
// rule — the whole storefront is intentionally more colourful now.)
const TILE_COLORS = [
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
]

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
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold text-on-surface">Shop by Category</h2>
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
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${TILE_COLORS[i % TILE_COLORS.length]} group-hover:scale-105 transition-transform`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '28px' }}>{cat.icon || ICONS[i % ICONS.length]}</span>
              </div>
              <p className="text-xs font-medium text-on-surface text-center leading-snug line-clamp-2">{cat.name}</p>
            </Link>
          ))
        }
      </CarouselRow>
    </section>
  )
}
