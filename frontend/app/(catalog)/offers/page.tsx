'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import type { FeaturedDeal, Coupon } from '@/types'

const TARGET_ICON: Record<string, string> = {
  DOCTOR: 'stethoscope', LAB_TEST: 'biotech', PLUS_PLAN: 'workspace_premium',
}

function targetHref(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR' && deal.doctor) return `/doctor-consult/${deal.doctor.id}`
  if (deal.target_type === 'LAB_TEST' && deal.lab_test) return `/lab-tests/${deal.lab_test.id}`
  if (deal.target_type === 'PLUS_PLAN') return '/plus-membership'
  return '#'
}

function targetTitle(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR') return deal.doctor ? `Dr. ${deal.doctor.name}` : 'Doctor Consult'
  if (deal.target_type === 'LAB_TEST') return deal.lab_test?.name || 'Lab Test'
  if (deal.target_type === 'PLUS_PLAN') return deal.plus_plan?.name || 'PharmaX Plus'
  return ''
}

function targetSubtitle(deal: FeaturedDeal) {
  if (deal.target_type === 'DOCTOR') return deal.doctor?.specialty
  if (deal.target_type === 'LAB_TEST') return (deal.lab_test as any)?.category_name
  if (deal.target_type === 'PLUS_PLAN') return deal.plus_plan ? `${deal.plus_plan.duration_days} days` : undefined
  return undefined
}

function ServiceDealCard({ deal }: { deal: FeaturedDeal }) {
  return (
    <Link href={targetHref(deal)}
      className="bg-surface rounded-2xl border border-outline-variant p-5 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
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

function CouponCard({ coupon }: { coupon: Coupon }) {
  const copy = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(coupon.code)
    toast.success('Coupon code copied!')
  }
  return (
    <div className="bg-surface rounded-2xl border border-dashed border-primary/40 p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-mono text-lg font-bold text-primary">{coupon.code}</p>
        <p className="text-xs text-on-surface-variant mt-1">
          {coupon.discount_type === 'PERCENTAGE' ? `${Number(coupon.discount_value).toFixed(0)}% off` : `NPR ${Number(coupon.discount_value).toFixed(0)} off`}
          {Number(coupon.min_order_amount) > 0 && ` on orders above NPR ${Number(coupon.min_order_amount).toFixed(0)}`}
        </p>
        {coupon.description && <p className="text-xs text-on-surface-variant mt-1">{coupon.description}</p>}
        <p className="text-[10px] text-on-surface-variant mt-1.5">Valid until {new Date(coupon.valid_until).toLocaleDateString()}</p>
      </div>
      <button onClick={copy}
        className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity flex-shrink-0">
        Copy Code
      </button>
    </div>
  )
}

export default function OffersPage() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle: toggleWishlist } = useWishlist()
  const { addToCart } = useCart()
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  const [deals, setDeals] = useState<FeaturedDeal[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    api.get('/offers/')
      .then((r) => {
        setDeals(r.data.data.featured_deals || [])
        setCoupons(r.data.data.coupons || [])
      })
      .catch(() => toast.error('Failed to load offers.'))
      .finally(() => setLoading(false))
  }, [])

  const handleAddToCart = useCallback(async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!hydrated) return
    if (!user) { router.push('/signin'); return }
    setCartLoading((p) => ({ ...p, [medId]: true }))
    try {
      await addToCart(medId, 1)
      toast.success('Added to cart!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not add to cart.')
    } finally {
      setCartLoading((p) => ({ ...p, [medId]: false }))
    }
  }, [hydrated, user, router, addToCart])

  const handleWishlist = useCallback(async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!hydrated) return
    if (!user) { router.push('/signin'); return }
    await toggleWishlist(medId)
  }, [hydrated, user, router, toggleWishlist])

  const medicineDeals = deals.filter((d) => d.target_type === 'MEDICINE' && d.medicine)
  const serviceDeals = deals.filter((d) => d.target_type !== 'MEDICINE')

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-error to-error/80 rounded-2xl p-8 text-on-error text-center space-y-2">
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '48px' }}>sell</span>
        <h1 className="text-3xl font-bold">Offers</h1>
        <p className="text-sm opacity-90 max-w-lg mx-auto">Curated deals and active coupons, all in one place.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <MedicineCardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          {deals.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-on-surface">Featured Deals</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
                {medicineDeals.map((d) => (
                  <MedicineCard key={d.id} medicine={d.medicine!} inWishlist={wishlistIds.includes(d.medicine!.id)}
                    cartLoading={!!cartLoading[d.medicine!.id]} onToggleWishlist={handleWishlist} onAddToCart={handleAddToCart}
                    badge={d.badge_text ? (
                      <span className="block bg-error text-on-error text-[10px] font-bold text-center py-1">{d.badge_text}</span>
                    ) : undefined} />
                ))}
                {serviceDeals.map((d) => <ServiceDealCard key={d.id} deal={d} />)}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-on-surface">Coupons</h2>
            {coupons.length === 0 ? (
              <div className="bg-surface rounded-2xl border border-outline-variant text-center py-12">
                <p className="text-sm text-on-surface-variant">No active coupons right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {coupons.map((c) => <CouponCard key={c.id} coupon={c} />)}
              </div>
            )}
          </div>

          {deals.length === 0 && coupons.length === 0 && (
            <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>sell</span>
              <p className="text-base font-medium text-on-surface mt-3">No offers right now — check back soon!</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
