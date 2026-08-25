import Link from 'next/link'
import type { FeaturedDeal } from '@/types'

const TARGET_ICON: Record<string, string> = {
  DOCTOR: 'stethoscope', LAB_TEST: 'biotech', PLUS_PLAN: 'workspace_premium',
}

export function targetHref(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR' && deal.doctor) return `/doctor-consult/${deal.doctor.id}`
  if (deal.target_type === 'LAB_TEST' && deal.lab_test) return `/lab-tests/${deal.lab_test.id}`
  if (deal.target_type === 'PLUS_PLAN') return '/plus-membership'
  return '#'
}

export function targetTitle(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR') return deal.doctor ? `Dr. ${deal.doctor.name}` : 'Doctor Consult'
  if (deal.target_type === 'LAB_TEST') return deal.lab_test?.name || 'Lab Test'
  if (deal.target_type === 'PLUS_PLAN') return deal.plus_plan?.name || 'PharmaX Plus'
  return ''
}

export function targetSubtitle(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR') return deal.doctor?.specialty
  if (deal.target_type === 'LAB_TEST') return (deal.lab_test as any)?.category_name
  if (deal.target_type === 'PLUS_PLAN') return deal.plus_plan ? `${deal.plus_plan.duration_days} days` : undefined
  return undefined
}

// The simpler promotional card for DOCTOR/LAB_TEST/PLUS_PLAN featured deals — no price-comparison
// visual to lean on for those (a doctor consult doesn't have an original_price the way a medicine
// does), so badge_text is the primary way the promotion is communicated at all. Shared by the
// offers page and FeaturedDealsRail (homepage/dashboard) rather than duplicated between them.
export default function ServiceDealCard({ deal, className = '' }: { deal: FeaturedDeal; className?: string }) {
  return (
    <Link href={targetHref(deal)}
      className={`bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '32px' }}>
          {TARGET_ICON[deal.target_type] || 'sell'}
        </span>
        {deal.badge_text && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-error/10 text-error whitespace-nowrap">{deal.badge_text}</span>
        )}
      </div>
      <p className="text-sm font-bold text-on-surface mt-3">{targetTitle(deal)}</p>
      {targetSubtitle(deal) && <p className="text-xs text-on-surface-variant mt-0.5">{targetSubtitle(deal)}</p>}
      <div className="mt-4 pt-3 border-t border-outline-variant text-sm font-semibold text-primary">View Offer</div>
    </Link>
  )
}
