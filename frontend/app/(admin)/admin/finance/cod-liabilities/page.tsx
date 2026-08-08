'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { DeliveryAgentCodLiability } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}

function CodLiabilitiesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const [liabilities, setLiabilities] = useState<DeliveryAgentCodLiability[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [confirmingFor, setConfirmingFor] = useState<DeliveryAgentCodLiability | null>(null)
  const [method, setMethod] = useState('CASH_DEPOSIT')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    api.get('/admin/finance/cod-liabilities/', { params })
      .then((r) => setLiabilities(r.data.data.liabilities || []))
      .catch(() => toast.error('Failed to load COD liabilities.'))
      .finally(() => setLoading(false))
  }, [canAccess, statusFilter])

  useEffect(() => { load() }, [load])

  const openConfirm = (l: DeliveryAgentCodLiability) => {
    setConfirmingFor(l)
    setMethod('CASH_DEPOSIT')
    setReference('')
  }

  const submitConfirm = async () => {
    if (!confirmingFor) return
    setSubmitting(true)
    try {
      const res = await api.post(`/admin/finance/cod-liabilities/${confirmingFor.id}/confirm-remittance/`, {
        remittance_method: method,
        reference: reference.trim() || undefined,
      })
      setLiabilities((prev) => prev.map((l) => (l.id === confirmingFor.id ? res.data.data.liability : l)))
      toast.success('Remittance confirmed.')
      setConfirmingFor(null)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to confirm remittance.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canAccess) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">COD Cash Liabilities</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Cash delivery agents collected at the doorstep and still owe back to the platform — the opposite direction from agent earnings.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="REMITTED">Remitted</option>
        </select>
      </div>

      {/* Distinct red/error accent throughout — this is money owed TO the platform, the opposite
          direction from agent-earnings' green "we pay them" framing. */}
      <div className="bg-surface rounded-2xl border border-error/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-error/5 border-b border-error/20">
              <tr>
                {['Agent', 'Order', 'Amount Collected', 'Days Outstanding', 'Status', 'Remitted Via', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-error/80 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : liabilities.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No COD liabilities found</td></tr>
              ) : liabilities.map((l) => (
                <tr key={l.id} className="hover:bg-error/5 transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">
                    <Link href={`/admin/finance/agents/${l.agent}`} className="hover:text-primary hover:underline">{l.agent_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">#{l.order_id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 font-bold text-error">{fmt(l.amount_collected)}</td>
                  <td className="px-4 py-3">
                    {l.status === 'PENDING' && l.days_outstanding !== null ? (
                      <span className={`text-xs font-semibold ${l.days_outstanding >= 7 ? 'text-error' : 'text-on-surface-variant'}`}>
                        {l.days_outstanding} day{l.days_outstanding !== 1 ? 's' : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${l.status === 'REMITTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">
                    {l.status === 'REMITTED' ? (
                      <>
                        {l.remittance_method === 'CASH_DEPOSIT' ? 'Cash Deposit' : 'Gateway Top-up'}
                        {l.reference && <span className="block font-mono">{l.reference}</span>}
                        <span className="block">{fmtDate(l.remitted_at)}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {l.status === 'PENDING' && (
                      <button onClick={() => openConfirm(l)}
                        className="px-3 py-1.5 bg-error text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">
                        Confirm Remittance
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmingFor(null)}>
          <div className="bg-surface rounded-2xl border border-outline-variant p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Confirm Remittance</h2>
              <p className="text-xs text-on-surface-variant mt-1">
                {confirmingFor.agent_name} · {fmt(confirmingFor.amount_collected)}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Remittance Method *</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary">
                <option value="CASH_DEPOSIT">Cash Deposit at Office</option>
                <option value="GATEWAY_TOPUP">Gateway Top-up</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Reference (optional)</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="Deposit slip #, gateway transaction id..."
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary" />
            </div>
            <div className="flex gap-2">
              <button onClick={submitConfirm} disabled={submitting}
                className="flex-1 py-2.5 bg-error text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                {submitting ? 'Confirming...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmingFor(null)}
                className="px-4 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CodLiabilitiesPage() {
  return (
    <Suspense fallback={<div className="h-40 bg-surface-container-low rounded-2xl animate-pulse" />}>
      <CodLiabilitiesContent />
    </Suspense>
  )
}
