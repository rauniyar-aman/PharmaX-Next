'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import Logo from '@/components/common/Logo'

const NAV_ITEMS = [
  { label: 'Dashboard',     href: '/doctor/dashboard',     icon: 'space_dashboard' },
  { label: 'Availability',  href: '/doctor/availability',  icon: 'event_available' },
  { label: 'Appointments',  href: '/doctor/appointments',  icon: 'calendar_month' },
  { label: 'Patients',      href: '/doctor/patients',      icon: 'groups' },
  { label: 'Earnings',      href: '/doctor/earnings',      icon: 'account_balance_wallet' },
]

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
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

  // Refresh doctor_verified on mount and on every navigation, so an admin verifying the doctor
  // mid-session takes effect without requiring a fresh login — same pattern as the delivery layout.
  useEffect(() => {
    if (!hydrated) return
    const current = useAuthStore.getState().user
    if (!current || current.role !== 'DOCTOR') return
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

  if (user.role !== 'DOCTOR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-surface rounded-2xl shadow-card-md max-w-sm">
          <span className="material-symbols-outlined text-5xl text-error">block</span>
          <h1 className="mt-4 text-xl font-bold text-on-surface">Access Denied</h1>
          <p className="mt-2 text-sm text-on-surface-variant">This area is only for doctor accounts.</p>
          <a href="/dashboard" className="mt-4 inline-block text-primary font-semibold text-sm">← Back to Dashboard</a>
        </div>
      </div>
    )
  }

  const pendingVerification = user.doctor_verified === false

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/doctor/dashboard">
              <Logo iconSize={32} textClassName="text-lg" />
            </Link>
            {!pendingVerification && (
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
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{dark ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <div className="hidden md:block text-right mr-1">
              <p className="text-sm font-bold text-on-surface leading-tight">Dr. {user.full_name}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight">Doctor</p>
            </div>
            <button onClick={() => { logout(); router.push('/signin') }}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-error-container hover:text-error transition-colors" title="Logout">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
            </button>
          </div>
        </div>
        {!pendingVerification && (
          <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 -mt-1 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                  <span className={`material-symbols-outlined ${active ? 'ms-filled' : ''}`} style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      <main className="w-full px-4 sm:px-6 py-6">
        {pendingVerification ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center p-8 bg-surface rounded-2xl border border-outline-variant max-w-sm">
              <span className="material-symbols-outlined text-5xl text-amber-500">pending</span>
              <h1 className="mt-4 text-xl font-bold text-on-surface">Pending Verification</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Your account is still being verified. You'll be able to manage your schedule and appointments once an admin approves you — check back soon.
              </p>
            </div>
          </div>
        ) : children}
      </main>
    </div>
  )
}
