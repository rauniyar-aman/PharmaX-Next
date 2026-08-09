'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Category } from '@/types'

const ICONS = ['medication', 'heart_plus', 'vaccines', 'medical_services', 'health_and_safety', 'science', 'healing', 'pediatrics', 'psychology', 'ophthalmology', 'dentistry', 'dermatology']
const COLORS = [
  'bg-primary/10 text-primary',
  'bg-secondary/10 text-secondary',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-600',
  'bg-rose-50 text-rose-600',
  'bg-indigo-50 text-indigo-600',
  'bg-cyan-50 text-cyan-600',
  'bg-purple-50 text-purple-600',
]

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">Categories</h1>
      {categories.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>category</span>
          <p className="text-base font-medium text-on-surface mt-3">No categories yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10 gap-4">
          {categories.map((cat, i) => (
            <Link key={cat.id} href={`/medicines?category=${encodeURIComponent(cat.name)}`}
              className="bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-md hover:border-primary/30 transition-all duration-200 group">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${COLORS[i % COLORS.length]}`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '28px' }}>{cat.icon || ICONS[i % ICONS.length]}</span>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug">{cat.name}</p>
                {cat.medicine_count !== undefined && (
                  <p className="text-xs text-on-surface-variant mt-0.5">{cat.medicine_count} medicine{cat.medicine_count !== 1 ? 's' : ''}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
