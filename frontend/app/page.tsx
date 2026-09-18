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
import HeroBanner from '@/components/home/HeroBanner'
import TrustStrip from '@/components/home/TrustStrip'
import CarePromo from '@/components/home/CarePromo'
import CategoryRail from '@/components/home/CategoryRail'
import BrandRail from '@/components/home/BrandRail'
import TabbedProductRail from '@/components/home/TabbedProductRail'
import StatsBar from '@/components/home/StatsBar'
import Testimonials from '@/components/home/Testimonials'
import OurServicesSection from '@/components/home/OurServicesSection'
import FeaturedDealsRail from '@/components/home/FeaturedDealsRail'
import ServiceTiles from '@/components/home/ServiceTiles'

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
  const [bannersByPlacement, setBannersByPlacement] = useState<Record<string, any[]>>({})

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    api.get('/promo-banners/')
      .then((r) => setBannersByPlacement(r.data.data.banners || {}))
      .catch(() => {})
  }, [])

  const toSlides = (banners: any[] = []): Slide[] => banners.map((b) => ({
    title: b.title, subtitle: b.subtitle, cta: b.cta, href: b.href, icon: b.icon, gradient: b.gradient, image_url: b.image_url,
  }))
  const heroSlides = toSlides(bannersByPlacement.HERO)
  // The page used to run two identical PromoSlider sections, one mid-page and one just above the
  // footer, which read as the same offer twice. There's one slider now, and it carries both
  // placements' banners so nothing an admin scheduled quietly stops appearing.
  const promoSlides = [...toSlides(bannersByPlacement.MID_PAGE), ...toSlides(bannersByPlacement.PRE_FOOTER)]

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
        {/* The masthead, promo carousel and trust strip sit inside one unit so the top of the page
            reads as a single thing rather than three stacked sections. */}
        <div className="space-y-4">
          <Masthead />
          <HeroBanner slides={heroSlides} />
          <TrustStrip />
        </div>

        <ServiceTiles />

        <FeaturedDealsRail
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
        />

        <TabbedProductRail
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
        />

        {/* Categories and brands are the same offer — browse by a facet — so they're one section.
            `empty:hidden` because each child hides itself when its own fetch comes back empty; the
            wrapper would otherwise still collect the page's section gap and leave a dead band. */}
        <section className="space-y-6 empty:hidden">
          <CategoryRail />
          <BrandRail />
        </section>

        <CarePromo />

        <PromoSlider slides={promoSlides} />

        <OurServicesSection />

        {/* The numbers and the reviews both answer "can I trust this" — one band, not two. Both
            hide themselves until the store has real figures and real reviews, which is the normal
            state early on, so the wrapper has to disappear with them. */}
        <section className="space-y-6 empty:hidden">
          <StatsBar />
          <Testimonials />
        </section>
      </main>

      <Footer />
    </div>
  )
}

// The storefront's opening statement. Search itself is the sticky header's field — the first
// interactive thing on the page at every breakpoint — so this doesn't repeat it; a second, bigger
// box two rows below the first one was the duplication this page already had too much of. What
// this adds is what the header can't say: what this place is, and the three jobs you can't type
// into a medicine search.
function Masthead() {
  return (
    <div className="pt-1">
      <h1 className="font-display text-[1.75rem] sm:text-4xl font-semibold tracking-tight text-on-surface leading-[1.1]">
        Healthcare, Simplified.
      </h1>
      <p className="text-sm text-on-surface-variant mt-2.5 max-w-[58ch] leading-relaxed">
        Medicines delivered across the Kathmandu Valley, lab tests collected from your home, and
        video consults with certified doctors anywhere in Nepal.
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-2.5 mt-4">
        {[
          { label: 'Upload a prescription', href: '/prescriptions', icon: 'upload_file' },
          { label: 'Book a lab test', href: '/lab-tests', icon: 'science' },
          { label: 'Consult a doctor', href: '/doctor-consult', icon: 'stethoscope' },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </div>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
        <div className="col-span-2 sm:col-span-1">
          <Logo iconSize={36} textClassName="text-lg" className="mb-2" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {support.store_name || 'Swasthaya'} — your trusted online pharmacy for medicines and wellness essentials.
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
            <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
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
      <div className="border-t border-outline-variant">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-xs text-on-surface-variant">
          © {new Date().getFullYear()} {support.store_name || 'Swasthaya'}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
