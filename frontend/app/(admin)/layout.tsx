'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { resolveImg } from '@/lib/resolveImg'
import api from '@/lib/api'
import AdminSidebar from '@/components/admin/AdminSidebar'

const PAGE_TITLES: Record<string, { title: string; icon: string }> = {
  '/admin/dashboard':     { title: 'Dashboard',           icon: 'dashboard' },
  '/admin/medicines':     { title: 'Medicines',            icon: 'medication' },
  '/admin/categories':    { title: 'Categories',           icon: 'category' },
  '/admin/inventory':     { title: 'Inventory',            icon: 'inventory_2' },
  '/admin/prescriptions': { title: 'Prescriptions',        icon: 'description' },
  '/admin/orders':        { title: 'Orders',               icon: 'shopping_cart' },
  '/admin/customers':     { title: 'Customers',            icon: 'group' },
  '/admin/delivery':      { title: 'Delivery',             icon: 'local_shipping' },
  '/admin/reports':       { title: 'Reports & Analytics',  icon: 'bar_chart' },
  '/admin/settings':      { title: 'Settings',             icon: 'settings' },
  '/admin/profile':       { title: 'Admin Profile',        icon: 'manage_accounts' },
}

function getPageMeta(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const key = Object.keys(PAGE_TITLES).find((k) => k !== '/admin/dashboard' && pathname.startsWith(k))
  return key ? PAGE_TITLES[key] : { title: 'Admin', icon: 'admin_panel_settings' }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Refresh the user object (permission_codes / is_super_admin) on mount and on every
  // navigation, so a permission change made mid-session by a super admin takes effect
  // without requiring the affected admin to log out and back in.
  useEffect(() => {
    if (!hydrated) return
    const current = useAuthStore.getState().user
    if (!current || current.role !== 'ADMIN') return
    api.get('/auth/me/')
      .then((r) => useAuthStore.getState().setUser(r.data.data.user))
      .catch(() => {})
  }, [hydrated, pathname])

  if (!hydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-surface rounded-2xl shadow-card-md max-w-sm">
          <span className="material-symbols-outlined text-5xl text-error">block</span>
          <h1 className="mt-4 text-xl font-bold text-on-surface">Access Denied</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Your account does not have admin privileges.</p>
          <a href="/dashboard" className="mt-4 inline-block text-primary font-semibold text-sm">← Back to Dashboard</a>
        </div>
      </div>
    )
  }

  const sidebarW = collapsed ? 72 : 256
  const { title, icon } = getPageMeta(pathname)
  const avatarSrc = resolveImg(user.avatar_url)

  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="min-h-screen flex flex-col transition-all duration-300" style={{ marginLeft: sidebarW }}>
        <header className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between px-6 h-16 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary ms-filled" style={{ fontSize: '18px' }}>{icon}</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface leading-tight">{title}</h2>
              <p className="text-[10px] text-on-surface-variant leading-tight hidden sm:block">
                {pathname.replace('/admin/', '').split('/').join(' › ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
          </div>

          <div className="relative">
            <button onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 pl-1 pr-3 py-1.5 rounded-xl hover:bg-surface-container transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden">
                {avatarSrc ? <img src={avatarSrc} className="w-full h-full object-cover" alt="" /> : user.full_name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-bold text-on-surface leading-tight">{user.full_name}</p>
                <p className="text-[10px] text-on-surface-variant leading-tight">Administrator</p>
              </div>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-12 w-52 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden py-1.5">
                  <Link href="/admin/profile" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>manage_accounts</span>
                    Profile
                  </Link>
                  {user.is_super_admin && (
                    <Link href="/admin/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: '19px' }}>settings</span>
                      Settings
                    </Link>
                  )}
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
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
