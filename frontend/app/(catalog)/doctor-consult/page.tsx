'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Doctor } from '@/types'

function DoctorCardSkeleton() {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant p-4 animate-pulse space-y-3">
      <div className="w-16 h-16 rounded-full bg-surface-container mx-auto" />
      <div className="h-4 bg-surface-container rounded w-3/4 mx-auto" />
      <div className="h-3 bg-surface-container rounded w-1/2 mx-auto" />
    </div>
  )
}

export default function DoctorConsultPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('')

  useEffect(() => {
    api.get('/doctors/specialties/').then((r) => setSpecialties(r.data.data.specialties || [])).catch(() => {})
  }, [])

  const fetchDoctors = useCallback(() => {
    setLoading(true)
    const params: Record<string, any> = { sortBy: 'popular' }
    if (search) params.search = search
    if (specialty) params.specialty = specialty
    api.get('/doctors/', { params }).then((r) => setDoctors(r.data.data.doctors || [])).catch(() => {}).finally(() => setLoading(false))
  }, [search, specialty])
  useEffect(() => { fetchDoctors() }, [fetchDoctors])

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-secondary to-secondary/80 rounded-2xl p-6 text-on-secondary">
        <h1 className="text-2xl font-bold">Consult a Doctor Online</h1>
        <p className="text-sm opacity-90 mt-1">Book an online consultation with certified doctors.</p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input type="text" placeholder="Search doctors or specialty..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSpecialty('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${specialty === '' ? 'bg-secondary text-on-secondary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            All Specialties
          </button>
          {specialties.map((s) => (
            <button key={s} onClick={() => setSpecialty(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${specialty === s ? 'bg-secondary text-on-secondary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <DoctorCardSkeleton key={i} />)}
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>stethoscope</span>
          <p className="text-base font-medium text-on-surface mt-3">No doctors found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {doctors.map((d) => (
            <Link key={d.id} href={`/doctor-consult/${d.id}`}
              className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="w-16 h-16 rounded-full bg-secondary/10 text-secondary flex items-center justify-center overflow-hidden mb-2">
                {d.photo_url ? (
                  <img src={resolveImg(d.photo_url) || undefined} alt={d.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>stethoscope</span>
                )}
              </div>
              <p className="text-sm font-semibold text-on-surface leading-snug">Dr. {d.name}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{d.specialty}</p>
              <p className="text-[11px] text-on-surface-variant mt-1">{d.experience_years}+ years experience</p>
              <div className="mt-3 pt-3 border-t border-outline-variant w-full flex items-center justify-between">
                <span className="text-sm font-bold text-on-surface">NPR {Number(d.consultation_fee).toFixed(0)}</span>
                <span className="text-xs font-semibold text-primary">Consult Now</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
