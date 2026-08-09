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
  { label: 'PharmaX Plus', href: '/plus-membership', icon: 'workspace_premium' },
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
  { label: 'PharmaX Plus', href: '/plus-membership' },
  { label: 'Health Insights', href: '/health-articles' },
  { label: 'Offers', href: '/medicines?sortBy=price-asc' },
  { label: 'Categories', href: '/categories' },
  { label: 'Brands', href: '/brands' },
  { label: 'Prescriptions', href: '/prescriptions' },
]

const GUEST_NAV_LINKS = [
  ...NAV_LINKS,
  { label: 'About Us', href: '/about' },
]

export default function PublicHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const { user, logout } = useAuthStore()
  const cartCount = useCartStore((s) => s.count)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { notifs, loading: notifLoading, unread, markRead, markAllRead, deleteOne, clearAll } = useNotifications()
  const [query, setQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

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

  return (
    <header className="sticky top-0 z-30 bg-surface">
      {/* Row 1: utility bar */}
      <div className="border-b border-outline-variant">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href={hydrated && user?.role === 'CUSTOMER' ? '/dashboard' : '/'} className="flex-shrink-0">
            <Logo iconSize={40} textClassName="text-2xl" />
          </Link>

          <div className="hidden md:block">
            <DeliveryLocationPicker />
          </div>

          <nav className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {hydrated && user && (
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>notifications</span>
                  {unread > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-error text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none border-2 border-surface">
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
                        onClearAll={clearAll}
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
                      : <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>person</span>
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
                          <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>admin_panel_settings</span>
                          Admin Dashboard
                        </Link>
                      ) : (
                        <>
                          {ACCOUNT_LINKS.map((item) => (
                            <Link key={item.href} href={item.href} onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>{item.icon}</span>
                              {item.label}
                            </Link>
                          ))}
                          <div className="my-1 border-t border-outline-variant" />
                          <Link href="/profile" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>person</span>
                            Profile
                          </Link>
                          <Link href="/settings" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>settings</span>
                            Settings
                          </Link>
                        </>
                      )}
                      <div className="my-1 border-t border-outline-variant" />
                      <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-error hover:bg-error-container transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>logout</span>
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/signin" className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-sm text-on-surface hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>person</span>
                <span className="hidden sm:inline">Hello, <span className="font-semibold">Sign in</span></span>
              </Link>
            )}

            {!hydrated || !user ? (
              <Link href="/signup" className="px-3 sm:px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary-dark transition-colors whitespace-nowrap">
                Get started
              </Link>
            ) : null}

            <div className="w-px h-6 bg-outline-variant mx-0.5 hidden sm:block" />

            <Link href={hydrated && user ? '/cart' : '/signin'} className="relative flex items-center gap-1.5 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>shopping_cart</span>
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

      {/* Row 2: nav links + search */}
      <div className="border-b border-outline-variant bg-surface-container-low">
        <div className="w-full px-4 sm:px-6 h-12 flex items-center gap-6">
          <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide">
            {(hydrated && user ? NAV_LINKS : GUEST_NAV_LINKS).map((item) => (
              <Link key={item.label} href={item.href}
                className={`text-sm font-medium whitespace-nowrap transition-colors ${isActive(item.href) ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                {item.label}
              </Link>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-sm ml-auto hidden sm:block">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search medicines, brands..."
                className="w-full pl-9 pr-3 py-1.5 border border-outline-variant rounded-full bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition"
              />
            </div>
          </form>
        </div>
      </div>

      <form onSubmit={handleSearch} className="sm:hidden px-4 py-3 border-b border-outline-variant bg-surface-container-low">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines..."
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-full bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition"
          />
        </div>
      </form>
    </header>
  )
}
