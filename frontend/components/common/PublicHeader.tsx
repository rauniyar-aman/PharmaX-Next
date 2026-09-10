'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import { useThemeStore } from '@/store/theme'
import { useNotifications } from '@/hooks/useNotifications'
import NotificationPanel from '@/components/notifications/NotificationPanel'
import DeliveryLocationPicker from '@/components/common/DeliveryLocationPicker'
import Logo from '@/components/common/Logo'
import { resolveImg } from '@/lib/resolveImg'

const ACCOUNT_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { label: 'Orders', href: '/orders', icon: 'package_2' },
  { label: 'Lab Test Bookings', href: '/lab-test-bookings', icon: 'biotech' },
  { label: 'My Appointments', href: '/appointments', icon: 'stethoscope' },
  { label: 'Subscriptions', href: '/subscriptions', icon: 'autorenew' },
  { label: 'Swasthaya Plus', href: '/plus-membership', icon: 'workspace_premium' },
  { label: 'Wallet', href: '/wallet', icon: 'account_balance_wallet' },
  { label: 'Refer & Earn', href: '/referrals', icon: 'redeem' },
  { label: 'Health Locker', href: '/health-locker', icon: 'folder_shared' },
  { label: 'Reminders', href: '/reminders', icon: 'alarm' },
  { label: 'Wishlist', href: '/wishlist', icon: 'favorite' },
  { label: 'Prescriptions', href: '/prescriptions', icon: 'description' },
  { label: 'My Reviews', href: '/reviews', icon: 'rate_review' },
  { label: 'Addresses', href: '/addresses', icon: 'location_on' },
]

const NAV_LINKS = [
  { label: 'Medicines', href: '/medicines' },
  { label: 'Healthcare', href: '/medicines?category=Healthcare+Devices' },
  { label: 'Doctor Consult', href: '/doctor-consult' },
  { label: 'Lab Tests', href: '/lab-tests' },
  { label: 'Swasthaya Plus', href: '/plus-membership' },
  { label: 'Health Insights', href: '/health-articles' },
  { label: 'Offers', href: '/offers' },
  { label: 'Categories', href: '/categories' },
  { label: 'Brands', href: '/brands' },
  { label: 'Prescriptions', href: '/prescriptions' },
]

const GUEST_NAV_LINKS = [
  ...NAV_LINKS,
  { label: 'About Us', href: '/about' },
]

// The category strip used to render all 10–11 destinations as one flat, undifferentiated row: a lot
// to scan, with no sense of what's primary. We now keep the high-intent destinations inline and fold
// the long tail into a single "More" menu, giving the strip a clear primary/secondary hierarchy
// without hiding anything — every link is still one interaction away.
const PRIMARY_NAV_LABELS = ['Medicines', 'Doctor Consult', 'Lab Tests', 'Offers', 'Swasthaya Plus']

export default function PublicHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const { user, logout } = useAuthStore()
  const cartCount = useCartStore((s) => s.count)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { notifs, loading: notifLoading, unread, markRead, markAllRead, deleteOne } = useNotifications()
  const [query, setQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  // Below md, row 2's nav links used to rely on undiscoverable horizontal scroll (no visual cue
  // anything was cut off, and no way to trigger it with a mouse on a resized desktop window) --
  // this drawer replaces that below the breakpoint; row 2 itself only renders at md+ now. Closes
  // automatically on navigation so it doesn't linger over the page that was just opened.
  useEffect(() => {
    setMobileNavOpen(false)
    setMoreOpen(false)
  }, [pathname])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/medicines${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ''}`)
  }

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false)
    logout()
    router.push('/signin')
  }, [logout, router])

  const avatarSrc = resolveImg(user?.avatar_url)
  const isActive = (href: string) => pathname === href.split('?')[0]

  const navLinks = hydrated && user ? NAV_LINKS : GUEST_NAV_LINKS
  const primaryNav = navLinks.filter((l) => PRIMARY_NAV_LABELS.includes(l.label))
  const moreNav = navLinks.filter((l) => !PRIMARY_NAV_LABELS.includes(l.label))
  const moreActive = moreNav.some((l) => isActive(l.href))

  return (
    <header className="sticky top-0 z-30 bg-surface">
      {/* Row 1: utility bar */}
      <div className="border-b border-outline-variant">
        <div className="w-full px-2 sm:px-6 h-16 flex items-center gap-0.5 sm:gap-4">
          <button onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-1.5 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0"
            aria-label="Open menu">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu</span>
          </button>

          <Link href={hydrated && user?.role === 'CUSTOMER' ? '/dashboard' : '/'} className="flex-shrink-0">
            <Logo iconSize={28} textClassName="text-base sm:text-2xl" />
          </Link>

          <div className="hidden md:block">
            <DeliveryLocationPicker />
          </div>

          {/* Primary search lives in the top utility bar (logo · search · account) — the
              conventional storefront position. It fills the row's centre, so it's the first
              thing the eye lands on and no longer competes with the nav links in row 2. */}
          <div className="flex-1 hidden md:flex justify-center px-4">
            <form onSubmit={handleSearch} className="w-full max-w-2xl" role="search">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search medicines and brands"
                  placeholder="Search medicines, brands..."
                  className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-full bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition"
                />
              </div>
            </form>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2 ml-auto">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {hydrated && user && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
                  {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none border-2 border-surface">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute right-0 top-12 w-80 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden">
                      <NotificationPanel
                        notifs={notifs}
                        loading={notifLoading}
                        unread={unread}
                        onMarkRead={markRead}
                        onMarkAllRead={markAllRead}
                        onDeleteOne={deleteOne}
                        viewAllHref="/notifications"
                        onClose={() => setNotifOpen(false)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {hydrated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl hover:bg-surface-container transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden ring-2 ring-primary/20">
                    {avatarSrc
                      ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" />
                      : <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>person</span>
                    }
                  </div>
                  <span className="hidden md:block text-sm text-on-surface">
                    Hello, <span className="font-semibold">{user.full_name?.split(' ')[0]}</span>
                  </span>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-12 w-56 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden py-1.5">
                      {user.role === 'ADMIN' ? (
                        <Link href="/admin/dashboard" onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>admin_panel_settings</span>
                          Admin Dashboard
                        </Link>
                      ) : (
                        <>
                          {ACCOUNT_LINKS.map((item) => (
                            <Link key={item.href} href={item.href} onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{item.icon}</span>
                              {item.label}
                            </Link>
                          ))}
                          <div className="my-1 border-t border-outline-variant" />
                          <Link href="/profile" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>person</span>
                            Profile
                          </Link>
                          <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
                            Settings
                          </Link>
                        </>
                      )}
                      <div className="my-1 border-t border-outline-variant" />
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-error hover:bg-error-container transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/signin" className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-sm text-on-surface hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>person</span>
                <span className="hidden sm:inline">Hello, <span className="font-semibold">Sign in</span></span>
              </Link>
            )}

            {!hydrated || !user ? (
              <Link href="/signup" className="btn btn-md btn-primary font-semibold whitespace-nowrap">
                Get started
              </Link>
            ) : null}

            <div className="w-px h-6 bg-outline-variant mx-0.5 hidden sm:block" />

            <Link href={hydrated && user ? '/cart' : '/signin'} className="relative flex items-center gap-1.5 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>shopping_cart</span>
              <span className="hidden sm:inline text-sm font-medium">Cart</span>
              {hydrated && cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 sm:static sm:ml-0.5 w-4 h-4 bg-secondary text-on-secondary text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </div>

      {/* Row 2: nav links -- md+ only below; the same nav list is reachable via the
          hamburger drawer (see bottom of this component) below that breakpoint. Search now
          lives in row 1, so this row is a dedicated category-nav strip. */}
      <div className="hidden md:block border-b border-outline-variant bg-surface-container-low">
        <div className="w-full px-4 sm:px-6 h-12 flex items-center">
          <div className="flex items-center gap-5 min-w-0">
            {primaryNav.map((item) => (
              <Link key={item.label} href={item.href}
                className={`text-sm font-medium whitespace-nowrap transition-colors ${isActive(item.href) ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {item.label}
              </Link>
            ))}
            {moreNav.length > 0 && (
              <div className="relative">
                <button onClick={() => setMoreOpen((o) => !o)}
                  aria-haspopup="true" aria-expanded={moreOpen}
                  className={`flex items-center gap-0.5 text-sm font-medium whitespace-nowrap transition-colors ${moreActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                  More
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{moreOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 w-52 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden py-1.5">
                      {moreNav.map((item) => (
                        <Link key={item.label} href={item.href} onClick={() => setMoreOpen(false)}
                          className={`block px-4 py-2.5 text-sm font-medium transition-colors ${isActive(item.href) ? 'text-primary bg-primary/5 font-semibold' : 'text-on-surface hover:bg-surface-container-low'}`}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSearch} className="md:hidden px-4 py-3 border-b border-outline-variant bg-surface-container-low" role="search">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search medicines"
            placeholder="Search medicines..."
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-full bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition"
          />
        </div>
      </form>

      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileNavOpen(false)} />
      )}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-surface flex flex-col z-50 transition-transform duration-300 md:hidden ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ boxShadow: '2px 0 12px -2px rgba(0,0,0,0.06)' }}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-outline-variant flex-shrink-0">
          <Logo iconSize={32} textClassName="text-lg" />
          <button onClick={() => setMobileNavOpen(false)} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors" aria-label="Close menu">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {primaryNav.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setMobileNavOpen(false)}
              className={`block px-5 py-3 text-sm font-medium transition-colors ${isActive(item.href) ? 'text-primary font-semibold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
              {item.label}
            </Link>
          ))}
          {moreNav.length > 0 && <div className="my-2 mx-5 border-t border-outline-variant" />}
          {moreNav.map((item) => (
            <Link key={item.label} href={item.href} onClick={() => setMobileNavOpen(false)}
              className={`block px-5 py-3 text-sm font-medium transition-colors ${isActive(item.href) ? 'text-primary font-semibold bg-primary/5' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </header>
  )
}
