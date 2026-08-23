'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { FinanceSummary } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function AdminFinancePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  useEffect(() => {
    if (!canAccess) return
    api.get('/admin/finance/summary/').then((r) => setSummary(r.data.data)).catch(() => toast.error('Failed to load finance summary.')).finally(() => setLoading(false))
  }, [canAccess])

  if (!canAccess) return null

  if (loading || !summary) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-surface-container-low rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  const outstandingCod = Number(summary.outstanding_cod.total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Finance</h1>
        <p className="text-sm text-on-surface-variant mt-1">Pharmacy payouts, delivery agent earnings, and COD cash accountability.</p>
      </div>

      {/* Given real visual weight per spec — this is the most operationally actionable number */}
      <div className={`rounded-2xl border p-6 ${outstandingCod > 0 ? 'bg-error/5 border-error/30' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className={`text-xs font-bold uppercase tracking-wide ${outstandingCod > 0 ? 'text-error' : 'text-emerald-600'}`}>Outstanding COD — not yet remitted</p>
            <p className={`text-4xl font-black mt-1 ${outstandingCod > 0 ? 'text-error' : 'text-emerald-600'}`}>{fmt(outstandingCod)}</p>
            <p className="text-xs text-on-surface-variant mt-1">Cash delivery agents are currently holding and still owe back to the platform.</p>
          </div>
          <Link href="/admin/finance/cod-liabilities?status=PENDING"
            className="px-4 py-2.5 bg-error text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            Review Outstanding →
          </Link>
        </div>
        {summary.outstanding_cod.by_agent.length > 0 && (
          <div className="mt-4 pt-4 border-t border-error/20 flex flex-wrap gap-2">
            {summary.outstanding_cod.by_agent.slice(0, 6).map((row) => (
              <Link key={row.agent_id} href={`/admin/finance/agents/${row.agent_id}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-xl border border-outline-variant text-xs hover:border-error/50 transition-colors">
                <span className="font-semibold text-on-surface">{row.agent_name}</span>
                <span className="text-error font-bold">{fmt(row.amount)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/finance/pharmacy-payouts" className="bg-surface rounded-2xl border border-outline-variant p-5 hover:border-primary/40 transition-colors">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Total Commission Earned</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{fmt(summary.total_commission_earned)}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">All payouts, accrued regardless of paid status</p>
        </Link>
        <Link href="/admin/finance/pharmacy-payouts?status=PENDING&funding_source=PLATFORM_FUNDS" className="bg-surface rounded-2xl border border-outline-variant p-5 hover:border-primary/40 transition-colors">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Pending Payouts — COD Funded</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmt(summary.pending_pharmacy_payouts.platform_funds)}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">Paid from platform funds, not order revenue</p>
        </Link>
        <Link href="/admin/finance/pharmacy-payouts?status=PENDING&funding_source=ORDER_REVENUE" className="bg-surface rounded-2xl border border-outline-variant p-5 hover:border-primary/40 transition-colors">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Pending Payouts — Order Funded</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{fmt(summary.pending_pharmacy_payouts.order_revenue)}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">Already in the platform's account</p>
        </Link>
        <Link href="/admin/finance/agent-earnings?status=PENDING" className="bg-surface rounded-2xl border border-outline-variant p-5 hover:border-primary/40 transition-colors">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Pending Agent Earnings</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{fmt(summary.pending_agent_earnings)}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">What we still owe delivery agents</p>
        </Link>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Coupon Discount Cost — This Month</p>
        <p className="text-2xl font-bold text-on-surface mt-1">{fmt(summary.coupon_cost_this_month)}</p>
        <p className="text-[10px] text-on-surface-variant mt-1">Total discount given away via coupons since the start of this month</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/admin/finance/pharmacy-payouts" className="flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-outline-variant hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>storefront</span>
          <span className="text-sm font-semibold text-on-surface">Pharmacy Payouts</span>
        </Link>
        <Link href="/admin/finance/agent-earnings" className="flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-outline-variant hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>sports_motorsports</span>
          <span className="text-sm font-semibold text-on-surface">Agent Earnings</span>
        </Link>
        <Link href="/admin/finance/cod-liabilities" className="flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-outline-variant hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>account_balance_wallet</span>
          <span className="text-sm font-semibold text-on-surface">COD Liabilities</span>
        </Link>
        <Link href="/admin/finance/collector-earnings" className="flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-outline-variant hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>medical_services</span>
          <span className="text-sm font-semibold text-on-surface">Collector Earnings</span>
        </Link>
        <Link href="/admin/finance/collector-cod-liabilities" className="flex items-center gap-3 px-4 py-3 bg-surface rounded-xl border border-outline-variant hover:border-primary/40 transition-colors">
          <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>account_balance_wallet</span>
          <span className="text-sm font-semibold text-on-surface">Collector COD Liabilities</span>
        </Link>
      </div>
    </div>
  )
}
