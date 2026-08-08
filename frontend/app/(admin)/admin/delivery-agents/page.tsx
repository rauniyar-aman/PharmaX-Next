'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { AdminDeliveryAgent } from '@/types'

export default function AdminDeliveryAgentsPage() {
  const [agents, setAgents] = useState<AdminDeliveryAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/delivery-agents/').then((r) => setAgents(r.data.data.agents || [])).catch(() => toast.error('Failed to load delivery agents.')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const patch = async (id: string, payload: Record<string, any>, successMsg: string) => {
    setUpdatingId(id)
    try {
      const res = await api.patch(`/admin/delivery-agents/${id}/`, payload)
      setAgents((prev) => prev.map((a) => (a.id === id ? res.data.data.agent : a)))
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
        <p className="text-xs text-on-surface-variant">{agents.length} delivery agent{agents.length !== 1 ? 's' : ''}</p>
        <Link href="/admin/delivery-agents/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Rider
        </Link>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Email', 'Vehicle', 'Verified', 'Online', 'Outstanding COD', 'Account'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : agents.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No delivery agents yet</td></tr>
              ) : agents.map((a) => {
                const outstanding = Number(a.outstanding_cod_balance)
                return (
                <tr key={a.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{a.full_name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{a.email}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{a.vehicle_type || '—'}</td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === a.id}
                      onClick={() => patch(a.id, { is_verified: !a.is_verified }, a.is_verified ? 'Rider unverified.' : 'Rider verified — they can now accept deliveries.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${a.is_verified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
                      {a.is_verified ? 'Verified' : 'Pending Verification'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${a.is_online ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                      {a.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/finance/agents/${a.id}`}
                      className={`text-xs font-semibold hover:underline whitespace-nowrap ${outstanding > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                      NPR {outstanding.toFixed(0)} {outstanding > 0 && '⚠'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === a.id}
                      onClick={() => patch(a.id, { user_is_active: !a.user_is_active }, a.user_is_active ? 'Rider account suspended.' : 'Rider account reactivated.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${a.user_is_active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-error/10 text-error hover:bg-error/20'}`}>
                      {a.user_is_active ? 'Active' : 'Suspended'}
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
