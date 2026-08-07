'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTest, LabTestCategory } from '@/types'

function LabTestCardSkeleton() {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-outline-variant animate-pulse p-4 space-y-3">
      <div className="h-4 bg-surface-container rounded w-1/2" />
      <div className="h-5 bg-surface-container rounded w-3/4" />
      <div className="h-3 bg-surface-container rounded w-1/3" />
      <div className="h-8 bg-surface-container rounded mt-3" />
    </div>
  )
}

export default function LabTestsPage() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [categories, setCategories] = useState<LabTestCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sortBy, setSortBy] = useState('popular')
  const [packagesOnly, setPackagesOnly] = useState(false)

  useEffect(() => {
    api.get('/lab-tests/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {})
  }, [])

  const fetchTests = useCallback(() => {
    setLoading(true)
    const params: Record<string, any> = { sortBy, limit: 40 }
    if (search) params.search = search
    if (category) params.category = category
    if (packagesOnly) params.isPackage = 'true'
    api.get('/lab-tests/', { params })
      .then((r) => {
        setTests(r.data.data.labTests || [])
        setTotal(r.data.data.pagination?.total || 0)
      })
      .catch(() => toast.error('Failed to load lab tests.'))
      .finally(() => setLoading(false))
  }, [search, category, sortBy, packagesOnly])

  useEffect(() => { fetchTests() }, [fetchTests])

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-on-primary">
        <h1 className="text-2xl font-bold">Lab Tests at Home</h1>
        <p className="text-sm opacity-90 mt-1">Book a certified lab test with free home sample collection.</p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input type="text" placeholder="Search lab tests..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${category === '' ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.name)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1 ${category === c.name ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>{c.icon || 'biotech'}</span>
              {c.name}
            </button>
          ))}
          <button onClick={() => setPackagesOnly((p) => !p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1 ${packagesOnly ? 'bg-purple-600 text-white' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>inventory_2</span>
            Packages Only
          </button>
          <div className="ml-auto flex items-center gap-1 bg-surface-container-low rounded-xl p-1">
            {[{ val: 'popular', label: 'Popular' }, { val: 'price-asc', label: 'Price: Low' }].map((opt) => (
              <button key={opt.val} onClick={() => setSortBy(opt.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy === opt.val ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-on-surface-variant">{total} tests</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <LabTestCardSkeleton key={i} />)}
        </div>
      ) : tests.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>biotech</span>
          <p className="text-base font-medium text-on-surface mt-3">No lab tests found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tests.map((t) => {
            const discount = Number(t.original_price) > Number(t.price)
              ? Math.round(((Number(t.original_price) - Number(t.price)) / Number(t.original_price)) * 100)
              : 0
            return (
              <Link key={t.id} href={`/lab-tests/${t.id}`}
                className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{t.category_name}</span>
                  {t.is_package && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">Package</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-on-surface leading-snug flex-1">{t.name}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>science</span>
                    {t.sample_type}
                  </span>
                  {t.reporting_time && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>schedule</span>
                      {t.reporting_time}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-base font-bold text-on-surface">NPR {Number(t.price).toFixed(0)}</span>
                  {discount > 0 && (
                    <>
                      <span className="text-xs text-on-surface-variant line-through">NPR {Number(t.original_price).toFixed(0)}</span>
                      <span className="text-xs font-bold text-error">{discount}% OFF</span>
                    </>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-outline-variant text-center text-sm font-semibold text-primary">
                  Book Now
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
