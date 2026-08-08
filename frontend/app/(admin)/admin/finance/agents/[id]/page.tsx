'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { AgentFinanceProfile } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AgentFinanceProfilePage() {
  const params = useParams()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [profile, setProfile] = useState<AgentFinanceProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  useEffect(() => {
    if (!canAccess) return
    api.get(`/admin/finance/agents/${params.id}/`)
      .then((r) => setProfile(r.data.data))
      .catch(() => toast.error('Failed to load agent financial profile.'))
      .finally(() => setLoading(false))
  }, [canAccess, params.id])

  if (!canAccess) return null
  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
  if (!profile) return <div className="text-center py-24 text-on-surface-variant">Agent not found.</div>

  const { agent, cod_record, earnings_record } = profile
  const outstanding = Number(cod_record.total_outstanding)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/delivery-agents" className="hover:text-primary transition-colors">Delivery Agents</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{agent.full_name}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-on-surface">{agent.full_name}</h1>
        <p className="text-sm text-on-surface-variant mt-1">{agent.email} · {agent.phone}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COD liabilities — what they owe us */}
        <div className={`rounded-2xl border p-5 ${outstanding > 0 ? 'bg-error/5 border-error/30' : 'bg-surface border-outline-variant'}`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${outstanding > 0 ? 'text-error' : 'text-on-surface-variant'}`}>Owes the Platform (COD)</p>
          <p className={`text-3xl font-black mt-1 ${outstanding > 0 ? 'text-error' : 'text-on-surface'}`}>{fmt(cod_record.total_outstanding)}</p>
          <div className="mt-3 flex gap-4 text-xs text-on-surface-variant">
            <span>Total ever collected: <span className="font-semibold text-on-surface">{fmt(cod_record.total_collected)}</span></span>
            {cod_record.oldest_unremitted_age_days !== null && (
              <span>Oldest unremitted: <span className={`font-semibold ${cod_record.oldest_unremitted_age_days >= 7 ? 'text-error' : 'text-on-surface'}`}>{cod_record.oldest_unremitted_age_days} day{cod_record.oldest_unremitted_age_days !== 1 ? 's' : ''}</span></span>
            )}
          </div>
        </div>

        {/* Earnings — what we owe them */}
        <div className="rounded-2xl border border-outline-variant bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Platform Owes Agent (Earnings)</p>
          <p className="text-3xl font-black mt-1 text-on-surface">{fmt(earnings_record.total_pending)}</p>
          <div className="mt-3 flex gap-4 text-xs text-on-surface-variant">
            <span>All-time earned: <span className="font-semibold text-on-surface">{fmt(earnings_record.total_earned)}</span></span>
            <span>Already paid: <span className="font-semibold text-on-surface">{fmt(earnings_record.total_paid)}</span></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COD remittance history */}
        <div className="bg-surface rounded-2xl border border-error/20 overflow-hidden">
          <div className="px-4 py-3 bg-error/5 border-b border-error/20">
            <p className="text-sm font-bold text-error">COD Remittance History</p>
          </div>
          <div className="divide-y divide-outline-variant max-h-[480px] overflow-y-auto">
            {cod_record.liabilities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-on-surface-variant">No COD deliveries yet.</p>
            ) : cod_record.liabilities.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-on-surface-variant">#{l.order_id.slice(0, 8).toUpperCase()}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${l.status === 'REMITTED' ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>{l.status}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-on-surface">{fmt(l.amount_collected)}</span>
                  <span className="text-xs text-on-surface-variant">
                    {l.status === 'PENDING' ? `${l.days_outstanding} day${l.days_outstanding !== 1 ? 's' : ''} outstanding` : fmtDate(l.remitted_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Earnings history */}
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
            <p className="text-sm font-bold text-on-surface">Earnings History</p>
          </div>
          <div className="divide-y divide-outline-variant max-h-[480px] overflow-y-auto">
            {earnings_record.earnings.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-on-surface-variant">No earnings yet.</p>
            ) : earnings_record.earnings.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-on-surface-variant">#{e.order_id.slice(0, 8).toUpperCase()}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${e.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>{e.status}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-on-surface">{fmt(e.amount)}</span>
                  <span className="text-xs text-on-surface-variant">{e.status === 'PAID' ? fmtDate(e.paid_at) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
