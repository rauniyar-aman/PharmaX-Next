'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { MedicineSubscription } from '@/types'

const FREQUENCY_LABELS: Record<number, string> = {
  7: 'Weekly', 15: 'Every 15 Days', 30: 'Monthly', 60: 'Every 2 Months', 90: 'Every 3 Months',
}

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<MedicineSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    api.get('/subscriptions/').then((r) => setSubs(r.data.data.subscriptions || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const togglePause = async (sub: MedicineSubscription) => {
    setBusy(sub.id)
    try {
      await api.put(`/subscriptions/${sub.id}/`, { is_active: !sub.is_active })
      toast.success(sub.is_active ? 'Subscription paused.' : 'Subscription resumed.')
      load()
    } catch {
      toast.error('Could not update subscription.')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancel this auto-refill subscription?')) return
    setBusy(id)
    try {
      await api.delete(`/subscriptions/${id}/`)
      toast.success('Subscription cancelled.')
      setSubs((p) => p.filter((s) => s.id !== id))
    } catch {
      toast.error('Could not cancel subscription.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!subs.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>autorenew</span>
      <h2 className="text-xl font-bold text-on-surface">No auto-refill subscriptions yet</h2>
      <p className="text-sm text-on-surface-variant">Set up auto-refill from any medicine's page to never run out.</p>
      <Link href="/medicines" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Browse Medicines
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Auto-Refill Subscriptions</h1>
        <span className="text-sm text-on-surface-variant">{subs.length} subscription{subs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {subs.map((s) => (
          <div key={s.id} className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center gap-4 flex-wrap">
            {s.medicine.image_url ? (
              <img src={resolveImg(s.medicine.image_url) || undefined} alt={s.medicine.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '24px' }}>medication</span>
              </div>
            )}
            <div className="flex-1 min-w-[180px]">
              <Link href={`/medicines/${s.medicine.id}`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">{s.medicine.name}</Link>
              <p className="text-xs text-on-surface-variant mt-0.5">Qty {s.quantity} · {FREQUENCY_LABELS[s.frequency_days] || `Every ${s.frequency_days} days`}</p>
              <p className="text-xs text-on-surface-variant">
                {s.is_active ? `Next delivery: ${new Date(s.next_delivery_date).toLocaleDateString()}` : 'Paused'}
              </p>
            </div>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
              {s.is_active ? 'Active' : 'Paused'}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => togglePause(s)} disabled={busy === s.id}
                className="text-xs font-semibold text-secondary hover:underline disabled:opacity-50">
                {s.is_active ? 'Pause' : 'Resume'}
              </button>
              <button onClick={() => cancel(s.id)} disabled={busy === s.id}
                className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
