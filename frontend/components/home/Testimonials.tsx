'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'

type Testimonial = { name: string; rating: number; comment: string }

export default function Testimonials() {
  const [items, setItems] = useState<Testimonial[] | null>(null)

  useEffect(() => {
    api.get('/home/showcase/')
      .then((r) => setItems(r.data.data.testimonials || []))
      .catch(() => setItems([]))
  }, [])

  // Auto-hide until we have real reviews to show (empty DB shows nothing here).
  if (!items || items.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-bold text-on-surface mb-1">What Customers Say</h2>
      <p className="text-xs text-on-surface-variant mb-3">Recent reviews from verified customers.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((t, idx) => (
          <div key={idx} className="bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col gap-3">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`material-symbols-outlined ${i < t.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '15px' }}>star</span>
              ))}
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed flex-1">&ldquo;{t.comment}&rdquo;</p>
            <div className="flex items-center gap-2.5 pt-2 border-t border-outline-variant">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                {t.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </div>
              <p className="text-xs font-semibold text-on-surface">{t.name}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
