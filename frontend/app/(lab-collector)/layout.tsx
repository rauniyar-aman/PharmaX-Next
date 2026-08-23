'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { useLabCollectorRequestsStore } from '@/store/labCollectorRequests'
import Logo from '@/components/common/Logo'
import api from '@/lib/api'
import { playNotificationChime, startRepeatingChime, stopRepeatingChime, installAudioUnlockOnFirstInteraction } from '@/lib/notificationSound'
import type { LabTestBooking } from '@/types'

const NAV_ITEMS = [
  { label: 'Requests', href: '/lab-collector/requests', icon: 'inbox' },
  { label: 'Active',   href: '/lab-collector/active',   icon: 'science' },
  { label: 'Finance',  href: '/lab-collector/finance',  icon: 'account_balance_wallet' },
]

const ALERT_TITLE = '🔴 New Collection — PharmaX'

/** Large, centered, blocking-by-default alert — same pattern as (delivery)/layout.tsx's own
 * NewDeliveryModal. Shows every currently-broadcast, unclaimed collection with a direct Accept, so
 * the collector can clear their whole queue without hunting for the Requests page. No Decline here
 * — unlike delivery, there's no per-collector decline endpoint for a lab collection (see
 * lab_collection.py: a collector who isn't interested just leaves it for someone else, it never
 * gets removed from anyone else's queue either way). Can be minimized to a small pill, but the
 * repeating chime keeps playing regardless of minimized state until every pending request has
 * actually been reviewed. */
function NewCollectionModal({
  requests, acceptingId, onAccept, onMinimize,
}: {
  requests: LabTestBooking[]
  acceptingId: string | null
  onAccept: (id: string) => void
  onMinimize: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-surface border-2 border-primary rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-outline-variant">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '30px' }}>science</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-on-surface">
              {requests.length > 1 ? `${requests.length} Collections Available!` : 'New Collection Available!'}
            </p>
            <p className="text-sm text-on-surface-variant mt-0.5">Nearby patients need a sample collected. Review below.</p>
          </div>
          <button onClick={onMinimize} title="Minimize (sound continues until reviewed)"
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="bg-surface-container-low rounded-2xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Collection</p>
                  <p className="text-sm font-bold text-on-surface truncate">{req.lab_test.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">{req.user?.full_name}</p>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${req.payment_method === 'CASH_ON_DELIVERY' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>{req.payment_method === 'CASH_ON_DELIVERY' ? 'payments' : 'check_circle'}</span>
                  {req.payment_method === 'CASH_ON_DELIVERY' ? 'Collect Cash' : 'Already Paid'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>flag</span>
                {req.address?.city || 'Unknown area'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>calendar_month</span>
                {req.scheduled_date} · {req.time_slot}
              </div>
              <button onClick={() => onAccept(req.id)} disabled={acceptingId === req.id}
                className="w-full py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                Accept
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-outline-variant bg-surface-container-lowest">
          <p className="text-[11px] text-on-surface-variant text-center">
            The alert sound will keep repeating until every collection above is accepted or reviewed.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Small floating pill shown once the modal has been minimized while requests are still pending
 * — clicking it reopens the full modal. Same behavior as (delivery)/layout.tsx's own pill. */
function MinimizedPill({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-full shadow-2xl hover:opacity-90 transition-opacity animate-pulse">
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>science</span>
      <span className="text-sm font-bold">{count} collection {count > 1 ? 'requests' : 'request'} — tap to review</span>
    </button>
  )
}

/** Same reasoning as (delivery)/layout.tsx's own banner: a chime played from inside a setInterval
 * callback (the "keep ringing" loop) can never unlock a browser's AudioContext by itself — only a
 * real click/tap counts. */
function NotificationOptInBanner({ userId, onDismiss }: { userId: string; onDismiss: () => void }) {
  const [requesting, setRequesting] = useState(false)

  const enable = async () => {
    setRequesting(true)
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
        <p className="text-xs sm:text-sm text-on-surface">Enable alerts for new collection requests?</p>
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

/** Same pattern as (delivery)/layout.tsx's own online/offline switch. */
function OnlineToggle({ isOnline, toggling, onToggle }: { isOnline: boolean; toggling: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={toggling} role="switch" aria-checked={isOnline}
      title={isOnline ? 'Click to go offline' : 'Click to go online and start receiving collection requests'}
      className="flex items-center gap-2 h-9 px-1 rounded-xl disabled:opacity-60">
      <span className={`text-xs font-semibold whitespace-nowrap ${isOnline ? 'text-emerald-600' : 'text-on-surface-variant'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
      <span className={`inline-flex items-center flex-shrink-0 w-10 h-6 rounded-full transition-colors ${isOnline ? 'bg-emerald-500' : 'bg-surface-container-high border border-outline-variant'}`}>
        <span className={`inline-block w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${toggling ? 'animate-pulse' : ''} ${isOnline ? 'translate-x-5' : 'translate-x-1'}`} />
      </span>
    </button>
  )
}

export default function LabCollectorLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [togglingOnline, setTogglingOnline] = useState(false)
  const [showOptIn, setShowOptIn] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const requests = useLabCollectorRequestsStore((s) => s.requests)
  const lastArrival = useLabCollectorRequestsStore((s) => s.lastArrival)
  const startPolling = useLabCollectorRequestsStore((s) => s.startPolling)
  const stopPolling = useLabCollectorRequestsStore((s) => s.stopPolling)
  const removeRequest = useLabCollectorRequestsStore((s) => s.removeRequest)
  const pendingCount = requests.length
  const previousTitleRef = useRef<string | null>(null)
  const hasAutoOpenedRef = useRef(false)

  // Same accept logic as the standalone Requests page (kept separate rather than shared, same
  // duplication (delivery)/layout.tsx already has with its own Requests page) — needed here too
  // since the modal has to work from whichever collector page is currently open.
  const accept = async (id: string) => {
    setAcceptingId(id)
    try {
      await api.post(`/lab-collector/requests/${id}/accept/`)
      removeRequest(id)
      toast.success('Accepted! Head to the patient\'s address for collection.')
      router.push('/lab-collector/active')
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to accept.'
      // someone else won it first, or it's no longer eligible — either way it's no longer actionable
      removeRequest(id)
      toast.error(msg)
    } finally {
      setAcceptingId(null)
    }
  }

  const handleToggleOnline = async () => {
    if (!user) return
    const next = !user.lab_collector_online
    setTogglingOnline(true)
    try {
      const res = await api.patch('/lab-collector/online/', { is_online: next })
      useAuthStore.getState().setUser({ ...user, lab_collector_online: res.data.data.is_online })
      toast.success(res.data.message)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status.')
    } finally {
      setTogglingOnline(false)
    }
  }

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
    installAudioUnlockOnFirstInteraction()
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Single source of truth for the available-collections poll lives in the store — started once
  // here so it runs across every collector page (Active, not just Requests). A collector who's
  // offline just always gets an empty list back (the backend already gates on is_online), so this
  // is safe to run unconditionally rather than only while online.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'LAB_COLLECTOR') return
    startPolling()
    return () => stopPolling()
  }, [hydrated, user, startPolling, stopPolling])

  // Rings continuously — independent of which collector page is open — for as long as there's at
  // least one available, unclaimed collection, same "keep ringing until reviewed" behavior as
  // (delivery)/layout.tsx's own alert.
  useEffect(() => {
    if (pendingCount > 0) startRepeatingChime()
    else stopRepeatingChime()
  }, [pendingCount])
  useEffect(() => () => stopRepeatingChime(), [])

  // Refresh lab_collector_verified on mount and on every navigation, so a verification made
  // mid-session by an admin takes effect without requiring the collector to log out and back in.
  useEffect(() => {
    if (!hydrated) return
    const current = useAuthStore.getState().user
    if (!current || current.role !== 'LAB_COLLECTOR') return
    api.get('/auth/me/')
      .then((r) => useAuthStore.getState().setUser(r.data.data.user))
      .catch(() => {})
  }, [hydrated, pathname])

  useEffect(() => {
    if (!hydrated || !user || user.role !== 'LAB_COLLECTOR') return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const dismissed = localStorage.getItem(`pharmax-notif-banner-dismissed:${user.id}`)
    setShowOptIn(!dismissed)
  }, [hydrated, user])

  // Revert the flashed tab title once the collector refocuses the tab.
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
    if (!lastArrival) return
    setShowModal(true)

    if (typeof document !== 'undefined' && document.hidden) {
      if (previousTitleRef.current === null) previousTitleRef.current = document.title
      document.title = ALERT_TITLE
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const first = lastArrival.items[0]
      const body = lastArrival.items.length > 1
        ? `${lastArrival.items.length} new collections available, including ${first.lab_test.name}`
        : `${first.lab_test.name} — ${first.user?.full_name || 'Patient'}`
      const n = new Notification('New Collection Request — PharmaX', { body, icon: '/PharmaX_Icon.png', tag: 'pharmax-new-collection' })
      n.onclick = () => {
        window.focus()
        router.push('/lab-collector/requests')
        n.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastArrival])

  // Auto-open the modal once if there's already a backlog waiting when the collector first loads
  // the app (not just on a fresh arrival) — logging in to 3 available collections should surface
  // them immediately, not just via the nav badge/chime.
  useEffect(() => {
    if (hasAutoOpenedRef.current) return
    if (pendingCount > 0) {
      hasAutoOpenedRef.current = true
      setShowModal(true)
    }
  }, [pendingCount])

  // Once the queue clears (last one accepted/expired), close the modal automatically.
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

  if (user.role !== 'LAB_COLLECTOR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-surface rounded-2xl shadow-card-md max-w-sm">
          <span className="material-symbols-outlined text-5xl text-error">block</span>
          <h1 className="mt-4 text-xl font-bold text-on-surface">Access Denied</h1>
          <p className="mt-2 text-sm text-on-surface-variant">This area is only for lab collector accounts.</p>
          <a href="/dashboard" className="mt-4 inline-block text-primary font-semibold text-sm">← Back to Dashboard</a>
        </div>
      </div>
    )
  }

  const pendingVerification = user.lab_collector_verified === false

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/lab-collector/requests">
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
            {!pendingVerification && (
              <OnlineToggle isOnline={!!user.lab_collector_online} toggling={togglingOnline} onToggle={handleToggleOnline} />
            )}
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{dark ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <div className="hidden md:block text-right mr-1">
              <p className="text-sm font-bold text-on-surface leading-tight">{user.full_name}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight">Lab Collector</p>
            </div>
            <button onClick={() => { logout(); router.push('/signin') }}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-error-container hover:text-error transition-colors" title="Logout">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>logout</span>
            </button>
          </div>
        </div>
        {!pendingVerification && (
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
        )}
        {showOptIn && !pendingVerification && <NotificationOptInBanner userId={user.id} onDismiss={() => setShowOptIn(false)} />}
      </header>

      <main className="w-full px-4 sm:px-6 py-6">
        {pendingVerification ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center p-8 bg-surface rounded-2xl border border-outline-variant max-w-sm">
              <span className="material-symbols-outlined text-5xl text-amber-500">pending</span>
              <h1 className="mt-4 text-xl font-bold text-on-surface">Pending Verification</h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                Your account is still being verified. You'll be able to see and accept collections once an admin approves you — check back soon.
              </p>
            </div>
          </div>
        ) : children}
      </main>

      {showModal && pendingCount > 0 && (
        <NewCollectionModal
          requests={requests}
          acceptingId={acceptingId}
          onAccept={accept}
          onMinimize={() => setShowModal(false)}
        />
      )}
      {!showModal && pendingCount > 0 && (
        <MinimizedPill count={pendingCount} onClick={() => setShowModal(true)} />
      )}
    </div>
  )
}
