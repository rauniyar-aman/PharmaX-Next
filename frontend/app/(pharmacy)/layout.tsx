'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useThemeStore } from '@/store/theme'
import Logo from '@/components/common/Logo'
import api from '@/lib/api'
import { playNotificationChime } from '@/lib/notificationSound'

const NAV_ITEMS = [
  { label: 'Inventory', href: '/pharmacy/inventory', icon: 'inventory_2' },
  { label: 'Requests',  href: '/pharmacy/requests',  icon: 'inbox' },
  { label: 'Orders',    href: '/pharmacy/orders',    icon: 'receipt_long' },
]

const REQUEST_POLL_MS = 5000

interface IncomingRequest {
  id: string
  medicine_name: string
  quantity: number
}

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

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const knownIdsRef = useRef<Set<string> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Polls from the layout (not just the Requests page) so a pharmacy sitting on Inventory or
  // Orders still gets alerted the instant a request comes in — this is the "not looking at the
  // screen right now" case: the chime plays and a persistent toast appears regardless of which
  // pharmacy page is open, then routes them to Requests on click.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'PHARMACY') return

    const poll = async () => {
      try {
        const res = await api.get('/pharmacy/requests/')
        const requests: IncomingRequest[] = res.data.data.requests || []
        const currentIds = new Set(requests.map((r) => r.id))
        setPendingCount(currentIds.size)

        if (knownIdsRef.current === null) {
          // first poll after page load — these already existed, don't alert for them
          knownIdsRef.current = currentIds
          return
        }

        const newOnes = requests.filter((r) => !knownIdsRef.current!.has(r.id))
        knownIdsRef.current = currentIds

        if (newOnes.length > 0) {
          playNotificationChime()
          const toastId = `new-request-${Date.now()}`
          toast.custom(
            (t) => (
              <NewRequestToast
                count={newOnes.length}
                onView={() => { toast.dismiss(t.id); router.push('/pharmacy/requests') }}
                onDismiss={() => toast.dismiss(t.id)}
              />
            ),
            { id: toastId, duration: 15000, position: 'top-right' },
          )
        }
      } catch {
        // transient network hiccup — next poll tick will retry, no need to alert on this
      }
    }

    poll()
    pollRef.current = setInterval(poll, REQUEST_POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
