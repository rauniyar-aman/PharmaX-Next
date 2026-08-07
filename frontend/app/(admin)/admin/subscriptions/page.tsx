'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { MedicineSubscription } from '@/types'

const FREQUENCY_LABELS: Record<number, string> = {
  7: 'Weekly', 15: 'Every 15 Days', 30: 'Monthly', 60: 'Every 2 Months', 90: 'Every 3 Months',
}

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<MedicineSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'due' | 'active' | 'paused'>('due')
  const [renewing, setRenewing] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params: any = {}
    if (filter === 'due') params.due = 'true'
    if (filter === 'active') params.active = 'true'
    if (filter === 'paused') params.active = 'false'
    api.get('/admin/subscriptions/', { params }).then((r) => setSubs(r.data.data.subscriptions || [])).catch(() => {}).finally(() => setLoading(false))
  }, [filter])
  useEffect(() => { load() }, [load])

  const handleRenew = async (id: string) => {
    setRenewing(id)
    try {
      await api.post(`/admin/subscriptions/${id}/renew/`)
      toast.success('Renewal order created!')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to renew.')
    } finally {
      setRenewing(null)
    }
  }

  const isDue = (s: MedicineSubscription) => s.is_active && new Date(s.next_delivery_date) <= new Date()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(['due', 'active', 'paused', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {f === 'due' ? 'Due for Renewal' : f}
            </button>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant">{subs.length} subscriptions</p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Medicine', 'Customer', 'Qty', 'Frequency', 'Next Delivery', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : subs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No subscriptions found</td></tr>
              ) : subs.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">{s.medicine?.name}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-on-surface">{s.user?.full_name}</p>
                    <p className="text-xs text-on-surface-variant">{s.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{s.quantity}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{FREQUENCY_LABELS[s.frequency_days] || `${s.frequency_days}d`}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                    {new Date(s.next_delivery_date).toLocaleDateString()}
                    {isDue(s) && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">DUE</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {s.is_active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRenew(s.id)} disabled={!s.is_active || renewing === s.id}
                      className="text-xs font-semibold text-primary hover:underline disabled:opacity-40">
                      {renewing === s.id ? 'Renewing...' : 'Renew Now'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
