'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import Logo from '@/components/common/Logo'

const NAV_ITEMS = [
  { label: 'Inventory', href: '/pharmacy/inventory', icon: 'inventory_2' },
  { label: 'Requests',  href: '/pharmacy/requests',  icon: 'inbox' },
  { label: 'Orders',    href: '/pharmacy/orders',    icon: 'receipt_long' },
]

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
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

  if (!hydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user.role !== 'PHARMACY') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-surface rounded-2xl shadow-card-md max-w-sm">
          <span className="material-symbols-outlined text-5xl text-error">block</span>
          <h1 className="mt-4 text-xl font-bold text-on-surface">Access Denied</h1>
          <p className="mt-2 text-sm text-on-surface-variant">This area is only for pharmacy accounts.</p>
          <a href="/dashboard" className="mt-4 inline-block text-primary font-semibold text-sm">← Back to Dashboard</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo iconSize={32} textClassName="text-lg" />
            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                    <span className={`material-symbols-outlined ${active ? 'ms-filled' : ''}`} style={{ fontSize: '18px' }}>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{dark ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <div className="hidden md:block text-right mr-1">
              <p className="text-sm font-bold text-on-surface leading-tight">{user.full_name}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight">Pharmacy</p>
            </div>
            <button onClick={() => { logout(); router.push('/signin') }}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-error-container hover:text-error transition-colors" title="Logout">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
            </button>
          </div>
        </div>
        <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 -mt-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className={`material-symbols-outlined ${active ? 'ms-filled' : ''}`} style={{ fontSize: '16px' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
