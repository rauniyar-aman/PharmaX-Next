'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyCampaignEnrollment } from '@/types'

export default function PharmacyCampaignsPage() {
  const [enrollments, setEnrollments] = useState<PharmacyCampaignEnrollment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/pharmacy/campaigns/').then((r) => setEnrollments(r.data.data.enrollments || [])).catch(() => toast.error('Failed to load campaigns.')).finally(() => setLoading(false))
  }, [])

  const now = Date.now()

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-on-surface">My Campaigns</h1>
        <p className="text-sm text-on-surface-variant mt-1">Incentive campaigns PharmaX has enrolled you in — a reduced commission rate or a cash bonus for a limited time.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-5 h-24 animate-pulse" />)}
        </div>
      ) : enrollments.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '40px' }}>redeem</span>
          <p className="mt-2 text-sm text-on-surface-variant">You're not enrolled in any campaign right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => {
            const expired = new Date(e.campaign.ends_at).getTime() < now
            const isDiscount = e.campaign.campaign_type === 'DISCOUNT'
            return (
              <div key={e.id} className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`material-symbols-outlined ms-filled flex-shrink-0 ${isDiscount ? 'text-primary' : 'text-amber-600'}`} style={{ fontSize: '28px' }}>
                    {isDiscount ? 'percent' : 'payments'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface">{e.campaign.name}</p>
                    {e.campaign.description && <p className="text-xs text-on-surface-variant mt-0.5">{e.campaign.description}</p>}
                    <p className="text-sm text-on-surface mt-2">
                      {isDiscount
                        ? <>Your commission rate is reduced to <span className="font-bold">{Number(e.campaign.discounted_commission_rate).toFixed(2)}%</span> on eligible deliveries.</>
                        : <>You'll receive a cash bonus of <span className="font-bold">NPR {Number(e.campaign.bonus_amount).toFixed(0)}</span>.</>}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {new Date(e.campaign.starts_at).toLocaleDateString()} – {new Date(e.campaign.ends_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${expired ? 'bg-surface-container text-on-surface-variant' : 'bg-emerald-50 text-emerald-600'}`}>
                    {expired ? 'Ended' : 'Active'}
                  </span>
                  {!isDiscount && (
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${e.bonus_paid ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {e.bonus_paid ? 'Bonus Paid' : 'Bonus Pending'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
