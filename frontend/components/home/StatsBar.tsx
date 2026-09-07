'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

type Stats = {
  happy_customers: number
  orders_delivered: number
  medicines_available: number
  cities_served: number
}

// Icons + labels are fixed; values come from GET /home/showcase/ (real counts, may be 0).
const ROWS: { icon: string; label: string; key: keyof Stats }[] = [
  { icon: 'group', label: 'Happy Customers', key: 'happy_customers' },
  { icon: 'local_shipping', label: 'Orders Delivered', key: 'orders_delivered' },
  { icon: 'medication', label: 'Medicines Available', key: 'medicines_available' },
  { icon: 'location_on', label: 'Cities Served', key: 'cities_served' },
]

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/home/showcase/')
      .then((r) => setStats(r.data.data.stats))
      .catch(() => {})
  }, [])

  return (
    <section className="bg-surface rounded-2xl border border-outline-variant p-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {ROWS.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{s.icon}</span>
            </div>
            <p className="text-lg font-bold text-on-surface">
              {stats ? stats[s.key].toLocaleString('en-IN') : '—'}
            </p>
            <p className="text-xs text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
