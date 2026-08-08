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
import PromoBannerGrid from '@/components/home/PromoBannerGrid'
import CategoryRail from '@/components/home/CategoryRail'
import BrandRail from '@/components/home/BrandRail'
import ProductRail from '@/components/home/ProductRail'
import CountdownBadge from '@/components/home/CountdownBadge'
import StatsBar from '@/components/home/StatsBar'
import Testimonials from '@/components/home/Testimonials'
import LabTestRail from '@/components/home/LabTestRail'
import DoctorRail from '@/components/home/DoctorRail'
import HealthArticlesRail from '@/components/home/HealthArticlesRail'
import QuickLinksGrid from '@/components/home/QuickLinksGrid'
import type { Medicine } from '@/types'

const PROMO_SLIDES: Slide[] = [
  {
    title: 'Order with Prescription',
    subtitle: 'Upload your prescription and get verified Rx medicines delivered safely.',
    cta: 'Upload Now', href: '/prescriptions', icon: 'description',
    gradient: 'from-primary to-primary/70',
  },
  {
    title: 'Up to 50% off Branded Substitutes',
    subtitle: 'Save more on genuine medicines without compromising on quality.',
    cta: 'Shop Deals', href: '/medicines?sortBy=price-asc', icon: 'sell',
    gradient: 'from-secondary to-secondary/70',
  },
  {
    title: 'Become a Plus Member',
    subtitle: 'Unlock free delivery and exclusive discounts on every order.',
    cta: 'Learn More', href: '/plus-membership', icon: 'workspace_premium',
    gradient: 'from-amber-500 to-amber-600',
  },
  {
    title: 'Diabetes & Wellness Essentials',
    subtitle: 'Everything you need to manage diabetes and stay healthy.',
    cta: 'Explore', href: '/medicines?category=Diabetes+Essentials', icon: 'water_drop',
    gradient: 'from-purple-500 to-purple-700',
  },
  {
    title: 'Lab Tests at Home',
    subtitle: 'Book a certified lab test with free home sample collection.',
    cta: 'Book Now', href: '/lab-tests', icon: 'biotech',
    gradient: 'from-cyan-600 to-cyan-700',
  },
  {
    title: 'Consult a Doctor Online',
    subtitle: 'Talk to certified doctors from the comfort of your home.',
    cta: 'Consult Now', href: '/doctor-consult', icon: 'stethoscope',
    gradient: 'from-rose-500 to-rose-600',
  },
]

function useMedicineRail(params: Record<string, any>) {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get('/medicines/', { params })
      .then((r) => { if (active) setMedicines(r.data.data.medicines || []) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)])

  return { medicines, loading }
}

function discountPct(m: Medicine) {
  const price = Number(m.price)
  const original = Number(m.original_price)
  if (!original || original <= price) return 0
  return (original - price) / original
}

export default function HomePage() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle: toggleWishlist } = useWishlist()
  const { addToCart } = useCart()

  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  // Every other customer-facing page bounces a logged-in admin to /admin/dashboard (see
  // app/(customer)/layout.tsx) — this standalone top-level page didn't have that guard, so an
  // admin browsing to "/" would see the full storefront instead. Logged-out visitors and
  // customers are unaffected; only an authenticated ADMIN gets redirected.
  useEffect(() => {
    if (hydrated && user?.role === 'ADMIN') router.replace('/admin/dashboard')
  }, [hydrated, user, router])

  const { medicines: newLaunches, loading: newLoading } = useMedicineRail({ sortBy: 'newest', limit: 10 })
  const { medicines: dealsPool, loading: dealsLoading } = useMedicineRail({ sortBy: 'price-asc', limit: 30 })
  const { medicines: topRated, loading: topLoading } = useMedicineRail({ sortBy: 'rating', limit: 10 })
  const { medicines: wellness, loading: wellnessLoading } = useMedicineRail({ category: 'Health Food and Drinks', limit: 10 })

  const deals = [...dealsPool].sort((a, b) => discountPct(b) - discountPct(a)).slice(0, 10)

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

  if (hydrated && user?.role === 'ADMIN') return null

  return (
    <div className="min-h-screen bg-background text-on-background">
      <PublicHeader />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-10">
        <PromoSlider slides={PROMO_SLIDES} />

        <QuickLinksGrid />

        <PromoBannerGrid />

        <CategoryRail />

        <BrandRail />

        <ProductRail
          title="New Launches"
          medicines={newLaunches}
          loading={newLoading}
          viewAllHref="/medicines?sortBy=newest"
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
        />

        <ProductRail
          title="Deals of the Day"
          medicines={deals}
          loading={dealsLoading}
          viewAllHref="/medicines?sortBy=price-asc"
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
          badge={() => <CountdownBadge />}
        />

        <ProductRail
          title="Top Rated"
          medicines={topRated}
          loading={topLoading}
          viewAllHref="/medicines?sortBy=rating"
          wishlistIds={wishlistIds}
          onToggleWishlist={handleWishlist}
          onAddToCart={handleAddToCart}
          cartLoading={cartLoading}
        />

        <ProductRail
          title="Wellness Essentials"
          medicines={wellness}
          loading={wellnessLoading}
          viewAllHref="/medicines?category=Health+Food+and+Drinks"
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
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8">
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
