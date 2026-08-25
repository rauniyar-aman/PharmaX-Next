'use client'
import { useState, useEffect, useCallback } from 'react'
import Logo from '@/components/common/Logo'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import PublicHeader from '@/components/common/PublicHeader'
import PromoSlider, { type Slide } from '@/components/common/PromoSlider'
import CategoryRail from '@/components/home/CategoryRail'
import BrandRail from '@/components/home/BrandRail'
import TabbedProductRail from '@/components/home/TabbedProductRail'
import StatsBar from '@/components/home/StatsBar'
import Testimonials from '@/components/home/Testimonials'
import LabTestRail from '@/components/home/LabTestRail'
import DoctorRail from '@/components/home/DoctorRail'
import HealthArticlesRail from '@/components/home/HealthArticlesRail'
import QuickLinksGrid from '@/components/home/QuickLinksGrid'

// Mirrors the redirect map in signin/restore-account — every non-customer role has its own
// dashboard and should never land on the customer storefront while logged in as themselves.
const NON_CUSTOMER_DASHBOARDS: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  PHARMACY: '/pharmacy/dashboard',
  DELIVERY_AGENT: '/delivery/requests',
  LAB_COLLECTOR: '/lab-collector/active',
}

export default function HomePage() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle: toggleWishlist } = useWishlist()
  const { addToCart } = useCart()

  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})
  const [promoSlides, setPromoSlides] = useState<Slide[]>([])

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    api.get('/promo-banners/')
      .then((r) => setPromoSlides((r.data.data.banners || []).map((b: any) => ({
        title: b.title, subtitle: b.subtitle, cta: b.cta, href: b.href, icon: b.icon, gradient: b.gradient,
      }))))
      .catch(() => {})
  }, [])

  // Every other customer-facing page bounces a logged-in non-customer to their own dashboard (see
  // app/(customer)/layout.tsx) — this standalone top-level page didn't have that guard, so a
  // pharmacy/admin/delivery-agent account browsing to "/" (e.g. clicking the logo) would see the
  // full customer storefront instead, still logged in as themselves. Logged-out visitors and
  // customers are unaffected.
  useEffect(() => {
    if (!hydrated || !user) return
    const dashboard = NON_CUSTOMER_DASHBOARDS[user.role as keyof typeof NON_CUSTOMER_DASHBOARDS]
    if (dashboard) router.replace(dashboard)
  }, [hydrated, user, router])

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

  if (hydrated && user && NON_CUSTOMER_DASHBOARDS[user.role]) return null

  return (
    <div className="min-h-screen bg-background text-on-background">
      <PublicHeader />

      <main className="w-full px-4 sm:px-6 py-6 space-y-10">
        <PromoSlider slides={promoSlides} />

        <QuickLinksGrid />

        <CategoryRail />

        <BrandRail />

        <TabbedProductRail
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
        />

        <LabTestRail />

        <DoctorRail />

        <HealthArticlesRail />

        <StatsBar />

        <Testimonials />
      </main>

      <Footer />
    </div>
  )
}

function Footer() {
  const [support, setSupport] = useState<{ store_name?: string; support_email?: string; support_phone?: string }>({})

  useEffect(() => {
    api.get('/settings/').then((r) => setSupport(r.data.data || {})).catch(() => {})
  }, [])

  return (
    <footer className="border-t border-outline-variant mt-4 bg-surface">
      <div className="w-full px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
        <div className="col-span-2 sm:col-span-1">
          <Logo iconSize={36} textClassName="text-lg" className="mb-2" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {support.store_name || 'PharmaX'} — your trusted online pharmacy for medicines and wellness essentials.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-3">Shop</p>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            <li><Link href="/medicines" className="hover:text-primary transition-colors">All Medicines</Link></li>
            <li><Link href="/categories" className="hover:text-primary transition-colors">Categories</Link></li>
            <li><Link href="/medicines?sortBy=price-asc" className="hover:text-primary transition-colors">Deals</Link></li>
            <li><Link href="/prescriptions" className="hover:text-primary transition-colors">Upload Prescription</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-3">Help</p>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
            <li><Link href="/signin" className="hover:text-primary transition-colors">Track Order</Link></li>
            {support.support_email && (
              <li><a href={`mailto:${support.support_email}`} className="hover:text-primary transition-colors">{support.support_email}</a></li>
            )}
            {support.support_phone && (
              <li><a href={`tel:${support.support_phone}`} className="hover:text-primary transition-colors">{support.support_phone}</a></li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold text-on-surface uppercase tracking-wide mb-3">Account</p>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            <li><Link href="/signin" className="hover:text-primary transition-colors">Sign In</Link></li>
            <li><Link href="/signup" className="hover:text-primary transition-colors">Create Account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-outline-variant py-4 text-center text-xs text-on-surface-variant">
        © {new Date().getFullYear()} {support.store_name || 'PharmaX'}. All rights reserved.
      </div>
    </footer>
  )
}
