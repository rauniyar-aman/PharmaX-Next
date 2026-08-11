'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import { useDeliveryRequestsStore } from '@/store/deliveryRequests'
import Logo from '@/components/common/Logo'
import api from '@/lib/api'
import { startRepeatingChime, stopRepeatingChime, installAudioUnlockOnFirstInteraction } from '@/lib/notificationSound'

const NAV_ITEMS = [
  { label: 'Requests', href: '/delivery/requests', icon: 'inbox' },
  { label: 'Active',   href: '/delivery/active',   icon: 'local_shipping' },
]

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
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const requests = useDeliveryRequestsStore((s) => s.requests)
  const startPolling = useDeliveryRequestsStore((s) => s.startPolling)
  const stopPolling = useDeliveryRequestsStore((s) => s.stopPolling)
  const pendingCount = requests.length

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
    </div>
  )
}
