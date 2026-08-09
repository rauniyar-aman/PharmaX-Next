'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { BRAND_COLORS, brandInitials } from '@/components/home/BrandRail'
import type { Brand } from '@/types'

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/medicines/brands/').then((r) => setBrands(r.data.data.brands || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">Brands</h1>
      {brands.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>storefront</span>
          <p className="text-base font-medium text-on-surface mt-3">No brands yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10 gap-4">
          {brands.map((brand, i) => (
            <Link key={brand.id} href={`/medicines?brand=${encodeURIComponent(brand.name)}`}
              className="bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col items-center gap-3 hover:-translate-y-1 hover:shadow-md hover:border-primary/30 transition-all duration-200 group">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold ${BRAND_COLORS[i % BRAND_COLORS.length]}`}>
                {brandInitials(brand.name)}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug">{brand.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{brand.medicine_count} medicine{brand.medicine_count !== 1 ? 's' : ''}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
