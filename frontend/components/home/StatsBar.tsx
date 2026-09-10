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
// `one` is the singular label used when the count is exactly 1, so a brand-new store shows
// "1 Happy Customer" / "1 City Served" rather than the ungrammatical plural.
const ROWS: { icon: string; label: string; one: string; key: keyof Stats }[] = [
  { icon: 'group', label: 'Happy Customers', one: 'Happy Customer', key: 'happy_customers' },
  { icon: 'local_shipping', label: 'Orders Delivered', one: 'Order Delivered', key: 'orders_delivered' },
  { icon: 'medication', label: 'Medicines Available', one: 'Medicine Available', key: 'medicines_available' },
  { icon: 'location_on', label: 'Cities Served', one: 'City Served', key: 'cities_served' },
]

// Social proof only helps once the numbers are real. A brand-new store legitimately returns tiny
// counts (1 customer, 1 city) which read as un-seeded test data and hurt trust more than the band
// helps — so the whole section stays hidden until the trust metrics clear a modest floor. The
// figures themselves are never faked; they come straight from the API. Lower these to reveal the
// band sooner, or set to 0 to always show it.
const CREDIBILITY_FLOORS: Partial<Record<keyof Stats, number>> = {
  happy_customers: 25,
  orders_delivered: 25,
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get('/home/showcase/')
      .then((r) => setStats(r.data.data.stats))
      .catch(() => {})
  }, [])

  // Hidden while loading and whenever the real figures aren't yet credible (no layout flash either
  // way — the band simply appears once the store has enough genuine activity to show).
  const credible = stats != null && (Object.keys(CREDIBILITY_FLOORS) as (keyof Stats)[])
    .every((k) => stats[k] >= (CREDIBILITY_FLOORS[k] ?? 0))
  if (!credible) return null

  return (
    <section className="bg-surface rounded-2xl border border-outline-variant p-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {ROWS.map((s) => {
          const value = stats ? stats[s.key] : null
          return (
            <div key={s.label} className="flex flex-col items-center text-center gap-1.5">
              <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{s.icon}</span>
              </div>
              <p className="text-lg font-bold text-on-surface">
                {value != null ? value.toLocaleString('en-IN') : '—'}
              </p>
              <p className="text-xs text-on-surface-variant">{value === 1 ? s.one : s.label}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
