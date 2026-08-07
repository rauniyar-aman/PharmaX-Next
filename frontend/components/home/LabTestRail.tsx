'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { LabTest } from '@/types'

function TestCardSkeleton() {
  return (
    <div className="w-56 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 animate-pulse space-y-3">
      <div className="h-3 bg-surface-container rounded w-1/2" />
      <div className="h-4 bg-surface-container rounded w-3/4" />
      <div className="h-8 bg-surface-container rounded mt-3" />
    </div>
  )
}

export default function LabTestRail() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/lab-tests/', { params: { sortBy: 'popular', limit: 10 } })
      .then((r) => setTests(r.data.data.labTests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && tests.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface">Popular Lab Tests</h2>
        <Link href="/lab-tests" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <TestCardSkeleton key={i} />)
          : tests.map((t) => {
            const discount = Number(t.original_price) > Number(t.price)
              ? Math.round(((Number(t.original_price) - Number(t.price)) / Number(t.original_price)) * 100)
              : 0
            return (
              <Link key={t.id} href={`/lab-tests/${t.id}`}
                className="w-56 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{t.category_name}</span>
                <p className="text-sm font-semibold text-on-surface leading-snug mt-1 flex-1">{t.name}</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-base font-bold text-on-surface">NPR {Number(t.price).toFixed(0)}</span>
                  {discount > 0 && <span className="text-xs text-on-surface-variant line-through">NPR {Number(t.original_price).toFixed(0)}</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-outline-variant text-center text-xs font-semibold text-primary">Book Now</div>
              </Link>
            )
          })
        }
      </div>
    </section>
  )
}
