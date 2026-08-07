'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Doctor } from '@/types'

function DoctorCardSkeleton() {
  return (
    <div className="w-44 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 animate-pulse space-y-3">
      <div className="w-14 h-14 rounded-full bg-surface-container mx-auto" />
      <div className="h-4 bg-surface-container rounded w-3/4 mx-auto" />
      <div className="h-3 bg-surface-container rounded w-1/2 mx-auto" />
    </div>
  )
}

export default function DoctorRail() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/doctors/', { params: { sortBy: 'popular' } })
      .then((r) => setDoctors((r.data.data.doctors || []).slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && doctors.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface">Consult Top Doctors</h2>
        <Link href="/doctor-consult" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <DoctorCardSkeleton key={i} />)
          : doctors.map((d) => (
            <Link key={d.id} href={`/doctor-consult/${d.id}`}
              className="w-44 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="w-14 h-14 rounded-full bg-secondary/10 text-secondary flex items-center justify-center overflow-hidden mb-2">
                {d.photo_url ? (
                  <img src={resolveImg(d.photo_url) || undefined} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>stethoscope</span>
                )}
              </div>
              <p className="text-sm font-semibold text-on-surface leading-snug">Dr. {d.name}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{d.specialty}</p>
              <div className="mt-2 pt-2 border-t border-outline-variant w-full text-xs font-semibold text-primary">NPR {Number(d.consultation_fee).toFixed(0)}</div>
            </Link>
          ))
        }
      </div>
    </section>
  )
}
