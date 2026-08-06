'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import { useThemeStore } from '@/store/theme'
import { useNotifications } from '@/hooks/useNotifications'
import NotificationPanel from '@/components/notifications/NotificationPanel'
import { resolveImg } from '@/lib/resolveImg'
import type { Medicine } from '@/types'

interface Props {
  sidebarCollapsed: boolean
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/medicines': 'Medicines',
  '/categories': 'Categories',
  '/orders': 'Orders',
  '/wishlist': 'Wishlist',
  '/prescriptions': 'Prescriptions',
  '/reviews': 'My Reviews',
  '/profile': 'Profile',
  '/settings': 'Settings',
  '/cart': 'Shopping Cart',
}

function getTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/medicines/')) return 'Medicine Details'
  if (pathname.startsWith('/orders/')) return 'Order Details'
  if (pathname.startsWith('/checkout/')) return 'Checkout'
  return 'Dashboard'
}

export default function DashboardNavbar({ sidebarCollapsed }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const cartCount = useCartStore((s) => s.count)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { notifs, loading: notifLoading, unread, markRead, markAllRead, deleteOne, clearAll } = useNotifications()

  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Medicine[]>([])
  const [searching, setSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setDropdownOpen(false); return }
    setSearching(true)
    try {
      const res = await api.get('/medicines/', { params: { search: q, limit: 6 } })
      setResults(res.data.data.medicines || [])
      setDropdownOpen(true)
    } catch {}
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (id: string) => {
    router.push(`/medicines/${id}`)
    setQuery('')
    setDropdownOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/medicines?search=${encodeURIComponent(query.trim())}`)
      setDropdownOpen(false)
    }
    if (e.key === 'Escape') { setDropdownOpen(false); setQuery('') }
  }

  const avatarSrc = resolveImg(user?.avatar_url)

  return (
    <header
      className="fixed top-0 right-0 z-20 h-16 bg-surface border-b border-outline-variant flex items-center justify-between px-5 transition-all duration-300"
      style={{ left: sidebarCollapsed ? '72px' : '256px' }}
    >
      <h1 className="text-[17px] font-semibold text-on-surface hidden sm:block">{getTitle(pathname)}</h1>

      <div className="flex items-center gap-1.5 ml-auto">
        {/* Search */}
        <div ref={searchWrapRef} className="relative">
          <div className={`relative flex items-center transition-all duration-200 ${query || dropdownOpen ? 'w-64' : 'w-44'}`}>
            <span className="material-symbols-outlined absolute left-3 text-on-surface-variant pointer-events-none" style={{ fontSize: '18px' }}>search</span>
            {searching && (
              <span className="absolute right-3 w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            )}
            <input
              type="text"
              placeholder="Search medicines..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.trim() && setDropdownOpen(true)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-8 py-2 text-sm bg-surface-container-low rounded-full border border-transparent focus:border-secondary focus:outline-none text-on-surface placeholder:text-on-surface-variant transition-all duration-200"
            />
          </div>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden">
              {results.length === 0 ? (
                <div className="px-4 py-5 text-center text-sm text-on-surface-variant">
                  No medicines found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </p>
                  <div className="divide-y divide-outline-variant max-h-72 overflow-y-auto">
                    {results.map((m) => (
                      <button key={m.id} onClick={() => handleSelect(m.id)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors text-left">
                        <div className="w-9 h-9 rounded-xl bg-surface-container flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {m.image_url
                            ? <img src={m.image_url} className="w-full h-full object-cover" alt="" />
                            : <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>medication</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{m.name}</p>
                          <p className="text-xs text-on-surface-variant truncate">{m.brand} · NPR {Number(m.price).toFixed(0)}</p>
                        </div>
                        <span className={`text-[10px] font-bold flex-shrink-0 ${m.in_stock ? 'text-primary' : 'text-error'}`}>
                          {m.in_stock ? 'In Stock' : 'Out'}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { router.push(`/medicines?search=${encodeURIComponent(query)}`); setDropdownOpen(false) }}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-secondary hover:bg-surface-container-low transition-colors border-t border-outline-variant text-center">
                    See all results for &ldquo;{query}&rdquo;
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button onClick={toggleDark}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
            {dark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        {/* Cart */}
        <Link href="/cart" className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>shopping_cart</span>
          {cartCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-secondary text-on-secondary text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </Link>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
          >
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

        <div className="w-px h-6 bg-outline-variant mx-0.5" />

        {/* User */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-1 pr-3 py-1.5 rounded-xl hover:bg-surface-container transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden ring-2 ring-primary/20">
              {avatarSrc
                ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" />
                : <span>{user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
              }
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-bold text-on-surface leading-tight">{user?.full_name || 'User'}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight">Customer</p>
            </div>
          </button>
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-12 w-52 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden py-1.5">
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
                <div className="my-1 border-t border-outline-variant" />
                <button
                  onClick={() => { setUserMenuOpen(false); logout(); router.push('/signin') }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-error hover:bg-error-container transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>logout</span>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
