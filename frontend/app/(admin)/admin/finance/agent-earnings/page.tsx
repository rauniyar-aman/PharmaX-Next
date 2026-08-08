'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { DeliveryAgentEarning } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AgentEarningsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const [earnings, setEarnings] = useState<DeliveryAgentEarning[]>([])
  const [loading, setLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  const load = useCallback(() => {
    if (!canAccess) return
    setLoading(true)
    const params: Record<string, string> = {}
    if (statusFilter) params.status = statusFilter
    api.get('/admin/finance/agent-earnings/', { params })
      .then((r) => setEarnings(r.data.data.earnings || []))
      .catch(() => toast.error('Failed to load agent earnings.'))
      .finally(() => setLoading(false))
  }, [canAccess, statusFilter])

  useEffect(() => { load() }, [load])

  const markPaid = async (id: string) => {
    setMarkingId(id)
    try {
      const res = await api.post(`/admin/finance/agent-earnings/${id}/mark-paid/`)
      setEarnings((prev) => prev.map((e) => (e.id === id ? res.data.data.earning : e)))
      toast.success('Marked as paid.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to mark paid.')
    } finally {
      setMarkingId(null)
    }
  }

  if (!canAccess) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Delivery Agent Earnings</h1>
        <p className="text-sm text-on-surface-variant mt-1">What the platform owes each delivery agent for completed deliveries.</p>
      </div>

      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Agent', 'Order', 'Amount', 'Status', 'Paid', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : earnings.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">No earnings found</td></tr>
              ) : earnings.map((e) => (
                <tr key={e.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">
                    <Link href={`/admin/finance/agents/${e.agent}`} className="hover:text-primary hover:underline">{e.agent_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">#{e.order_id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">{fmt(e.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${e.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(e.paid_at)}</td>
                  <td className="px-4 py-3">
                    {e.status === 'PENDING' && (
                      <button onClick={() => markPaid(e.id)} disabled={markingId === e.id}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap">
                        Mark Paid
                      </button>
                    )}
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

export default function AgentEarningsPage() {
  return (
    <Suspense fallback={<div className="h-40 bg-surface-container-low rounded-2xl animate-pulse" />}>
      <AgentEarningsContent />
    </Suspense>
  )
}
