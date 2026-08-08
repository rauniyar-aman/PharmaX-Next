'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { usePharmacyRequestsStore } from '@/store/pharmacyRequests'
import Logo from '@/components/common/Logo'
import { playNotificationChime, startRepeatingChime, stopRepeatingChime } from '@/lib/notificationSound'
import type { PharmacyFulfillmentRequest } from '@/types'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/pharmacy/dashboard', icon: 'space_dashboard' },
  { label: 'Inventory', href: '/pharmacy/inventory', icon: 'inventory_2' },
  { label: 'Requests',  href: '/pharmacy/requests',  icon: 'inbox' },
  { label: 'Orders',    href: '/pharmacy/orders',    icon: 'receipt_long' },
  { label: 'Team',      href: '/pharmacy/team',      icon: 'group' },
]

const ALERT_TITLE = '🔴 New Request — PharmaX Pharmacy'

/** Large, centered, blocking-by-default alert — replaces the old small top-right toast. Shows
 * every currently-pending request (not just the newest arrival) with direct Accept/Decline, so
 * the pharmacy can clear its whole backlog without leaving whatever page it's on. It can be
 * minimized to a small pill, but the repeating chime (wired in the layout below) keeps playing
 * regardless of minimized state until every pending request has actually been reviewed. */
function NewRequestModal({
  requests, respondingId, onRespond, onMinimize,
}: {
  requests: PharmacyFulfillmentRequest[]
  respondingId: string | null
  onRespond: (id: string, action: 'accept' | 'decline') => void
  onMinimize: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-surface border-2 border-primary rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-outline-variant">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '30px' }}>notifications_active</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-on-surface">
              {requests.length > 1 ? `${requests.length} New Order Requests!` : 'New Order Request!'}
            </p>
            <p className="text-sm text-on-surface-variant mt-0.5">Nearby customers need medicines you carry. Review below.</p>
          </div>
          <button onClick={onMinimize} title="Minimize (sound continues until reviewed)"
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-surface-container-low rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface">{req.medicine_name} <span className="font-normal text-on-surface-variant">× {req.quantity}</span></p>
                <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
                  {req.city || 'Unknown area'}{req.province ? `, ${req.province}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onRespond(req.id, 'accept')} disabled={respondingId === req.id}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  Accept
                </button>
                <button onClick={() => onRespond(req.id, 'decline')} disabled={respondingId === req.id}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-xl hover:bg-surface-container transition-colors disabled:opacity-60">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-outline-variant bg-surface-container-lowest">
          <p className="text-[11px] text-on-surface-variant text-center">
            The alert sound will keep repeating until every request above is accepted or declined.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Small floating pill shown once the modal has been minimized while requests are still pending
 * — clicking it reopens the full modal. The chime keeps playing whether this or the modal is
 * showing, so this is purely a "less intrusive but still visible" state, not a dismissal. */
function MinimizedPill({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-full shadow-2xl hover:opacity-90 transition-opacity animate-pulse">
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>notifications_active</span>
      <span className="text-sm font-bold">{count} pending request{count > 1 ? 's' : ''} — tap to review</span>
    </button>
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
  const [showModal, setShowModal] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const requests = usePharmacyRequestsStore((s) => s.requests)
  const lastArrival = usePharmacyRequestsStore((s) => s.lastArrival)
  const startPolling = usePharmacyRequestsStore((s) => s.startPolling)
  const stopPolling = usePharmacyRequestsStore((s) => s.stopPolling)
  const removeRequest = usePharmacyRequestsStore((s) => s.removeRequest)
  const pendingCount = requests.length
  const previousTitleRef = useRef<string | null>(null)
  const hasAutoOpenedRef = useRef(false)

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setRespondingId(id)
    try {
      await api.post(`/pharmacy/requests/${id}/${action}/`)
      removeRequest(id)
      toast.success(action === 'accept' ? 'Accepted! Check Orders for pickup details.' : 'Declined.')
    } catch (err: any) {
      const msg = err.response?.data?.message || `Failed to ${action}.`
      // expired, or another team member on this pharmacy already responded — either way it's no
      // longer actionable, so drop it from the list rather than leaving a dead button.
      removeRequest(id)
      toast.error(msg)
    } finally {
      setRespondingId(null)
    }
  }

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

  // Fires on every genuinely-new batch of requests (see store): pop the large centered alert
  // modal always; if the tab is in the background, also flash the title and — if permission was
  // granted via the opt-in banner — fire a real OS-level Notification, since none of the on-page
  // signals are visible to someone who isn't looking at this tab at all.
  useEffect(() => {
    if (!lastArrival) return
    setShowModal(true)

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

  // Auto-open the modal once if there's already a backlog waiting when the dashboard first loads
  // (not just on a fresh arrival) — a pharmacy that logs in to 4 pending requests should see them
  // immediately, not just find out from the nav badge.
  useEffect(() => {
    if (hasAutoOpenedRef.current) return
    if (pendingCount > 0) {
      hasAutoOpenedRef.current = true
      setShowModal(true)
    }
  }, [pendingCount])

  // The alert sound repeats — independent of whether the modal is open, minimized, or the
  // pharmacy has navigated elsewhere entirely — until every pending request is actually accepted
  // or declined (pendingCount hits 0), per the "play sound until reviewed" requirement.
  useEffect(() => {
    if (pendingCount > 0) startRepeatingChime()
    else stopRepeatingChime()
  }, [pendingCount])
  useEffect(() => () => stopRepeatingChime(), [])

  // Once the backlog clears (last one accepted/declined), close the modal automatically.
  useEffect(() => {
    if (pendingCount === 0) setShowModal(false)
  }, [pendingCount])

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

      {showModal && pendingCount > 0 && (
        <NewRequestModal
          requests={requests}
          respondingId={respondingId}
          onRespond={respond}
          onMinimize={() => setShowModal(false)}
        />
      )}
      {!showModal && pendingCount > 0 && (
        <MinimizedPill count={pendingCount} onClick={() => setShowModal(true)} />
      )}
    </div>
  )
}
