'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { AdminLabCollector } from '@/types'

export default function AdminLabCollectorsPage() {
  const [collectors, setCollectors] = useState<AdminLabCollector[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/lab-collectors/').then((r) => setCollectors(r.data.data.collectors || [])).catch(() => toast.error('Failed to load lab collectors.')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const patch = async (id: string, payload: Record<string, any>, successMsg: string) => {
    setUpdatingId(id)
    try {
      const res = await api.patch(`/admin/lab-collectors/${id}/`, payload)
      setCollectors((prev) => prev.map((c) => (c.id === id ? res.data.data.collector : c)))
      toast.success(successMsg)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{collectors.length} lab collector{collectors.length !== 1 ? 's' : ''}</p>
        <Link href="/admin/lab-collectors/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Collector
        </Link>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Email', 'Verified', 'Online', 'Outstanding COD', 'Account'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : collectors.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">No lab collectors yet</td></tr>
              ) : collectors.map((c) => {
                const outstanding = Number(c.outstanding_cod_balance)
                return (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{c.full_name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{c.email}</td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === c.id}
                      onClick={() => patch(c.id, { is_verified: !c.is_verified }, c.is_verified ? 'Collector unverified.' : 'Collector verified — they can now accept collections.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${c.is_verified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
                      {c.is_verified ? 'Verified' : 'Pending Verification'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${c.is_online ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                      {c.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/finance/collector-cod-liabilities?collector=${c.id}`}
                      className={`text-xs font-semibold hover:underline whitespace-nowrap ${outstanding > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                      NPR {outstanding.toFixed(0)} {outstanding > 0 && '⚠'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === c.id}
                      onClick={() => patch(c.id, { user_is_active: !c.user_is_active }, c.user_is_active ? 'Collector account suspended.' : 'Collector account reactivated.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${c.user_is_active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-error/10 text-error hover:bg-error/20'}`}>
                      {c.user_is_active ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
