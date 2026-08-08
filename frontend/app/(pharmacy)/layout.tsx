'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { usePharmacyRequestsStore } from '@/store/pharmacyRequests'
import Logo from '@/components/common/Logo'
import { playNotificationChime } from '@/lib/notificationSound'

const NAV_ITEMS = [
  { label: 'Inventory', href: '/pharmacy/inventory', icon: 'inventory_2' },
  { label: 'Requests',  href: '/pharmacy/requests',  icon: 'inbox' },
  { label: 'Orders',    href: '/pharmacy/orders',    icon: 'receipt_long' },
]

const ALERT_TITLE = '🔴 New Request — PharmaX Pharmacy'

function NewRequestToast({ count, onView, onDismiss }: { count: number; onView: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-surface border-2 border-primary rounded-2xl shadow-2xl p-4 w-80">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '22px' }}>notifications_active</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface">{count > 1 ? `${count} New Order Requests!` : 'New Order Request!'}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">A nearby customer needs a medicine you carry.</p>
        <div className="flex gap-2 mt-2">
          <button onClick={onView} className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity">
            Review Now
          </button>
          <button onClick={onDismiss} className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

function NotificationOptInBanner({ userId, onDismiss }: { userId: string; onDismiss: () => void }) {
  const [requesting, setRequesting] = useState(false)

  const enable = async () => {
    setRequesting(true)
    // Fire the chime synchronously inside this click handler — this is the genuine user gesture
    // that unlocks the browser's AudioContext. Without it, the *first* real alert chime (the one
    // that matters most, e.g. right after the pharmacy loads the page and walks away) can fail
    // silently on browsers that require a gesture before any audio plays.
    playNotificationChime()
    try {
      await Notification.requestPermission()
    } catch {
      // permission API unavailable/blocked — the banner still dismisses, chime still works
    } finally {
      localStorage.setItem(`pharmax-notif-banner-dismissed:${userId}`, '1')
      setRequesting(false)
      onDismiss()
    }
  }

  const dismiss = () => {
    localStorage.setItem(`pharmax-notif-banner-dismissed:${userId}`, '1')
    onDismiss()
  }

  return (
    <div className="bg-primary/5 border-b border-primary/20 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>notifications</span>
        <p className="text-xs sm:text-sm text-on-surface">Enable desktop alerts for new requests?</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={enable} disabled={requesting}
          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
          {requesting ? 'Enabling...' : 'Enable'}
        </button>
        <button onClick={dismiss} className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
          No thanks
        </button>
      </div>
    </div>
  )
}

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [showOptIn, setShowOptIn] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const requests = usePharmacyRequestsStore((s) => s.requests)
  const lastArrival = usePharmacyRequestsStore((s) => s.lastArrival)
  const startPolling = usePharmacyRequestsStore((s) => s.startPolling)
  const stopPolling = usePharmacyRequestsStore((s) => s.stopPolling)
  const pendingCount = requests.length
  const previousTitleRef = useRef<string | null>(null)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Single source of truth for the incoming-requests poll lives in the store — started once here
  // so it runs across every pharmacy page (Inventory, Orders, ...), not just /pharmacy/requests.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'PHARMACY') return
    startPolling()
    return () => stopPolling()
  }, [hydrated, user, startPolling, stopPolling])

  // Show the opt-in banner once per pharmacy account, unless they've already dismissed it or the
  // browser doesn't support Notifications / already has a permission decision recorded.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'PHARMACY') return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const dismissed = localStorage.getItem(`pharmax-notif-banner-dismissed:${user.id}`)
    setShowOptIn(!dismissed)
  }, [hydrated, user])

  // Revert the flashed tab title once the pharmacy either refocuses the tab or navigates to
  // Requests themselves — whichever happens first counts as "they've seen it."
  useEffect(() => {
    const revert = () => {
      if (previousTitleRef.current !== null) {
        document.title = previousTitleRef.current
        previousTitleRef.current = null
      }
    }
    const handleVisibility = () => { if (!document.hidden) revert() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (pathname === '/pharmacy/requests' && previousTitleRef.current !== null) {
      document.title = previousTitleRef.current
      previousTitleRef.current = null
    }
  }, [pathname])

  // Fires on every genuinely-new batch of requests (see store): chime + toast always; if the tab
  // is in the background, also flash the title and — if permission was granted via the opt-in
  // banner — fire a real OS-level Notification, since neither the chime nor the toast is visible
  // to someone who isn't looking at this tab at all.
  useEffect(() => {
    if (!lastArrival) return
    playNotificationChime()

    const toastId = `new-request-${lastArrival.at}`
    toast.custom(
      (t) => (
        <NewRequestToast
          count={lastArrival.items.length}
          onView={() => { toast.dismiss(t.id); router.push('/pharmacy/requests') }}
          onDismiss={() => toast.dismiss(t.id)}
        />
      ),
      { id: toastId, duration: 15000, position: 'top-right' },
    )

    if (typeof document !== 'undefined' && document.hidden) {
      if (previousTitleRef.current === null) previousTitleRef.current = document.title
      document.title = ALERT_TITLE

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const first = lastArrival.items[0]
        const body = lastArrival.items.length > 1
          ? `${lastArrival.items.length} new requests, including ${first.medicine_name}`
          : `${first.medicine_name} × ${first.quantity}`
        const n = new Notification('New Order Request — PharmaX', { body, icon: '/PharmaX_Icon.png', tag: 'pharmax-new-request' })
        n.onclick = () => {
          window.focus()
          router.push('/pharmacy/requests')
          n.close()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastArrival])

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
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                    <span className={`material-symbols-outlined ${active ? 'ms-filled' : ''}`} style={{ fontSize: '18px' }}>{item.icon}</span>
                    {item.label}
                    {item.href === '/pharmacy/requests' && pendingCount > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
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
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                <span className={`material-symbols-outlined ${active ? 'ms-filled' : ''}`} style={{ fontSize: '16px' }}>{item.icon}</span>
                {item.label}
                {item.href === '/pharmacy/requests' && pendingCount > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 bg-error text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        {showOptIn && <NotificationOptInBanner userId={user.id} onDismiss={() => setShowOptIn(false)} />}
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
