'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { useDeliveryRequestsStore } from '@/store/deliveryRequests'
import Logo from '@/components/common/Logo'
import api from '@/lib/api'
import { playNotificationChime, startRepeatingChime, stopRepeatingChime, installAudioUnlockOnFirstInteraction } from '@/lib/notificationSound'
import type { DeliveryFulfillment } from '@/types'

const NAV_ITEMS = [
  { label: 'Requests', href: '/delivery/requests', icon: 'inbox' },
  { label: 'Active',   href: '/delivery/active',   icon: 'local_shipping' },
  { label: 'Finance',  href: '/delivery/finance',  icon: 'account_balance_wallet' },
]

const ALERT_TITLE = '🔴 New Delivery — PharmaX'
// Rider dispatch happens as soon as an order is PLACED — well before a pharmacy has necessarily
// finished packing — so a pending request can be genuinely ready for pickup or still mid-prep.
// Same set the standalone Requests page uses for its "Ready now" vs "Still preparing" badge.
const READY_STATUSES = new Set(['AWAITING_DELIVERY'])

/** Large, centered, blocking-by-default alert — same pattern as the pharmacy app's
 * NewRequestModal. Shows every currently-pending delivery (not just the newest arrival) with
 * direct Accept/Decline, so the rider can clear their whole queue without hunting for the
 * Requests page. Can be minimized to a small pill, but the repeating chime keeps playing
 * regardless of minimized state until every pending request has actually been reviewed. */
function NewDeliveryModal({
  requests, respondingId, onRespond, onMinimize,
}: {
  requests: DeliveryFulfillment[]
  respondingId: string | null
  onRespond: (id: string, action: 'accept' | 'decline') => void
  onMinimize: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-surface border-2 border-primary rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 p-6 pb-4 border-b border-outline-variant">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '30px' }}>local_shipping</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-on-surface">
              {requests.length > 1 ? `${requests.length} Deliveries Available!` : 'New Delivery Available!'}
            </p>
            <p className="text-sm text-on-surface-variant mt-0.5">Nearby pharmacies need a pickup. Review below.</p>
          </div>
          <button onClick={onMinimize} title="Minimize (sound continues until reviewed)"
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {requests.map((req) => {
            const ready = READY_STATUSES.has(req.status)
            return (
              <div key={req.id} className="bg-surface-container-low rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Pickup</p>
                    <p className="text-sm font-bold text-on-surface truncate">{req.pharmacy_name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{req.pharmacy_address}</p>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${ready ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>{ready ? 'inventory_2' : 'hourglass_top'}</span>
                    {ready ? 'Ready now' : 'Still preparing'}
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant space-y-0.5">
                  {req.items.map((item, i) => <p key={i}>{item.medicine_name} × {item.quantity}</p>)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>flag</span>
                  Drop-off: {req.city || 'Unknown area'}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onRespond(req.id, 'decline')} disabled={respondingId === req.id}
                    className="flex-1 py-2 bg-surface-container text-on-surface-variant text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                    Decline
                  </button>
                  <button onClick={() => onRespond(req.id, 'accept')} disabled={respondingId === req.id}
                    className="flex-1 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                    Accept
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-6 py-3 border-t border-outline-variant bg-surface-container-lowest">
          <p className="text-[11px] text-on-surface-variant text-center">
            The alert sound will keep repeating until every delivery above is accepted or declined.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Small floating pill shown once the modal has been minimized while requests are still pending
 * — clicking it reopens the full modal. Same behavior as the pharmacy app's own pill: the chime
 * keeps playing whether this or the modal is showing, so this is purely "less intrusive but still
 * visible," not a dismissal. */
function MinimizedPill({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-primary text-on-primary px-5 py-3 rounded-full shadow-2xl hover:opacity-90 transition-opacity animate-pulse">
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>local_shipping</span>
      <span className="text-sm font-bold">{count} delivery {count > 1 ? 'requests' : 'request'} — tap to review</span>
    </button>
  )
}

/** Same reasoning as the pharmacy layout's own banner: a chime played from inside a setInterval
 * callback (the "keep ringing" loop) can never unlock a browser's AudioContext by itself — only a
 * real click/tap counts. Without an explicit gesture like this "Enable" button, a rider who just
 * leaves the app open waiting for work (never taps anywhere) gets a silently-failing chime on
 * every arrival, since installAudioUnlockOnFirstInteraction() only helps once *some* tap happens. */
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
        <p className="text-xs sm:text-sm text-on-surface">Enable alerts for new delivery requests?</p>
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

/** Same pattern as the pharmacy app's own online/offline switch — the rider-facing equivalent
 * of DeliveryAgent.is_online, which nothing anywhere used to let a rider actually toggle. */
function OnlineToggle({ isOnline, toggling, onToggle }: { isOnline: boolean; toggling: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} disabled={toggling} role="switch" aria-checked={isOnline}
      title={isOnline ? 'Click to go offline' : 'Click to go online and start receiving delivery requests'}
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

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [togglingOnline, setTogglingOnline] = useState(false)
  const [showOptIn, setShowOptIn] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const requests = useDeliveryRequestsStore((s) => s.requests)
  const lastArrival = useDeliveryRequestsStore((s) => s.lastArrival)
  const startPolling = useDeliveryRequestsStore((s) => s.startPolling)
  const stopPolling = useDeliveryRequestsStore((s) => s.stopPolling)
  const removeRequest = useDeliveryRequestsStore((s) => s.removeRequest)
  const pendingCount = requests.length
  const previousTitleRef = useRef<string | null>(null)
  const hasAutoOpenedRef = useRef(false)

  // Same accept/decline logic as the standalone Requests page (kept separate rather than shared,
  // same duplication the pharmacy layout/PharmacyRequestsPage pair already has) — needed here too
  // since the modal has to work from whichever delivery page the rider is currently on, not just
  // /delivery/requests.
  const respond = async (id: string, action: 'accept' | 'decline') => {
    setRespondingId(id)
    try {
      await api.post(`/delivery/requests/${id}/${action}/`)
      removeRequest(id)
      if (action === 'accept') {
        toast.success('Accepted! Head to the pharmacy for pickup.')
        router.push('/delivery/active')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || `Failed to ${action}.`
      // someone else won it first, or it expired — either way it's no longer actionable
      removeRequest(id)
      toast.error(msg)
    } finally {
      setRespondingId(null)
    }
  }

  const handleToggleOnline = async () => {
    if (!user) return
    const next = !user.delivery_agent_online
    setTogglingOnline(true)
    try {
      const res = await api.patch('/delivery/agent/online/', { is_online: next })
      useAuthStore.getState().setUser({ ...user, delivery_agent_online: res.data.data.is_online })
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
    // Unlocks the chime's AudioContext on first interaction anywhere on the site — see
    // (pharmacy)/layout.tsx for why a setInterval-driven retry alone can never do this.
    installAudioUnlockOnFirstInteraction()
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Single source of truth for the available-deliveries poll lives in the store — started once
  // here so it runs across every delivery page (Active, not just Requests). A rider who's offline
  // just always gets an empty list back (the backend already gates on is_online), so this is safe
  // to run unconditionally rather than only while online.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'DELIVERY_AGENT') return
    startPolling()
    return () => stopPolling()
  }, [hydrated, user, startPolling, stopPolling])

  // Rings continuously — independent of which delivery page the rider is on — for as long as
  // there's at least one available, unclaimed pickup, same "keep ringing until reviewed" behavior
  // as the pharmacy app's own alert. Stops the moment the list empties (accepted by this rider,
  // claimed by someone else, or expired).
  useEffect(() => {
    if (pendingCount > 0) startRepeatingChime()
    else stopRepeatingChime()
  }, [pendingCount])
  useEffect(() => () => stopRepeatingChime(), [])

  // Refresh delivery_agent_verified on mount and on every navigation, so a verification made
  // mid-session by an admin takes effect without requiring the agent to log out and back in.
  useEffect(() => {
    if (!hydrated) return
    const current = useAuthStore.getState().user
    if (!current || current.role !== 'DELIVERY_AGENT') return
    api.get('/auth/me/')
      .then((r) => useAuthStore.getState().setUser(r.data.data.user))
      .catch(() => {})
  }, [hydrated, pathname])

  // Show the opt-in banner once per rider account, unless already dismissed or the browser
  // doesn't support Notifications / already has a permission decision recorded — same gating as
  // the pharmacy layout's banner.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'DELIVERY_AGENT') return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const dismissed = localStorage.getItem(`pharmax-notif-banner-dismissed:${user.id}`)
    setShowOptIn(!dismissed)
  }, [hydrated, user])

  // Revert the flashed tab title once the rider refocuses the tab.
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

  // Fires on every genuinely-new batch of requests (see store): if the tab is in the background,
  // flash the title and — if permission was granted via the opt-in banner — fire a real OS-level
  // Notification. Fires regardless of tab visibility (not gated on document.hidden) — Notification
  // permission persists across page loads once granted, unlike the chime's AudioContext, so this
  // is the one channel that still works on a tab the rider opened and never touched at all this
  // session (browsers refuse to play ANY audio before a real gesture on that page load, no matter
  // what the code does — see (pharmacy)/layout.tsx for the same reasoning).
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
        ? `${lastArrival.items.length} new deliveries available, including ${first.pharmacy_name}`
        : `${first.pharmacy_name} — ${first.items.map((i) => i.medicine_name).join(', ')}`
      const n = new Notification('New Delivery Request — PharmaX', { body, icon: '/PharmaX_Icon.png', tag: 'pharmax-new-delivery' })
      n.onclick = () => {
        window.focus()
        router.push('/delivery/requests')
        n.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastArrival])

  // Auto-open the modal once if there's already a backlog waiting when the rider first loads the
  // app (not just on a fresh arrival) — logging in to 3 available deliveries should surface them
  // immediately, not just via the nav badge/chime.
  useEffect(() => {
    if (hasAutoOpenedRef.current) return
    if (pendingCount > 0) {
      hasAutoOpenedRef.current = true
      setShowModal(true)
    }
  }, [pendingCount])

  // Once the queue clears (last one accepted/declined), close the modal automatically.
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

  if (user.role !== 'DELIVERY_AGENT') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8 bg-surface rounded-2xl shadow-card-md max-w-sm">
          <span className="material-symbols-outlined text-5xl text-error">block</span>
          <h1 className="mt-4 text-xl font-bold text-on-surface">Access Denied</h1>
          <p className="mt-2 text-sm text-on-surface-variant">This area is only for delivery agent accounts.</p>
          <a href="/dashboard" className="mt-4 inline-block text-primary font-semibold text-sm">← Back to Dashboard</a>
        </div>
      </div>
    )
  }

  const pendingVerification = user.delivery_agent_verified === false

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-surface-container-lowest border-b border-outline-variant">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/delivery/requests">
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
              <OnlineToggle isOnline={!!user.delivery_agent_online} toggling={togglingOnline} onToggle={handleToggleOnline} />
            )}
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{dark ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <div className="hidden md:block text-right mr-1">
              <p className="text-sm font-bold text-on-surface leading-tight">{user.full_name}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight">Delivery Agent</p>
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
                Your account is still being verified. You'll be able to see and accept deliveries once an admin approves you — check back soon.
              </p>
            </div>
          </div>
        ) : children}
      </main>

      {showModal && pendingCount > 0 && (
        <NewDeliveryModal
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
