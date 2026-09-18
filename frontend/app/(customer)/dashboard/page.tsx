'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import MedicineCard, { MedicineCardSkeleton } from '@/components/medicine/MedicineCard'
import CarouselRow from '@/components/common/CarouselRow'
import type { DoctorAppointment, Medicine, Order, Prescription, ReminderScheduleItem, Wallet } from '@/types'

const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'Awaiting prescription', PRESCRIPTION_REJECTED: 'Prescription rejected',
  BROADCASTING: 'Finding a pharmacy', AWAITING_PAYMENT: 'Awaiting payment', NO_PHARMACY_FOUND: 'No pharmacy found',
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PROCESSING: 'Being packed', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', RETURNED: 'Returned',
}

// An order sitting in one of these is stalled until the customer acts, so it reads as a problem
// on the day's track rather than as something quietly in motion.
const ORDER_NEEDS_YOU = new Set(['AWAITING_PRESCRIPTION', 'PRESCRIPTION_REJECTED', 'AWAITING_PAYMENT', 'NO_PHARMACY_FOUND'])
// Finished either way — nothing left to watch today.
const ORDER_SETTLED = new Set(['DELIVERED', 'CANCELLED', 'RETURNED'])

const APPT_LIVE = new Set(['PENDING', 'CONFIRMED', 'AWAITING_PAYMENT'])

/* ── The day's track ─────────────────────────────────────────────────────────────────────────
   Doses, the order in flight and today's consult are one time-ordered sequence, not four
   unrelated stat cards — so they share a single rail and a single vocabulary of states. State
   drives colour and nothing else does: green is done, amber is due, red needs you, navy moves. */
type EntryState = 'done' | 'due' | 'ahead' | 'moving' | 'needs-you'

interface Entry {
  key: string
  time: string | null
  state: EntryState
  icon: string
  title: string
  detail?: string
  cta?: { label: string; href: string }
  markTaken?: () => void
}

const NODE: Record<EntryState, string> = {
  done: 'w-2.5 h-2.5 bg-success',
  due: 'w-3 h-3 bg-warning ring-4 ring-warning/25',
  ahead: 'w-2.5 h-2.5 border-2 border-outline bg-surface',
  moving: 'w-2.5 h-2.5 bg-primary',
  'needs-you': 'w-2.5 h-2.5 bg-error',
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// time_slot is a free-form label off the doctor's availability ("10:00 - 10:30", "10:00 AM"),
// and we only need a sortable HH:MM to place the consult on the track.
function firstClockTime(raw: string | undefined | null): string | null {
  const m = (raw || '').match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle: toggleWishlist } = useWishlist()
  const { addToCart } = useCart()
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  const [orders, setOrders] = useState<Order[]>([])
  const [schedule, setSchedule] = useState<ReminderScheduleItem[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)

  // Held in state rather than read during render so the first paint has no clock in it — and
  // refreshed on the same minute cadence the shell already polls reminders on, so the now-marker
  // never drifts away from the doses it sits between.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

  // The same endpoints the Orders / Reminders / Wallet / Appointments / Prescriptions pages read —
  // this page only re-reads them, it doesn't introduce a dashboard-shaped copy of any of them.
  useEffect(() => {
    Promise.all([
      api.get('/orders/').then((r) => setOrders(r.data.data.orders || [])).catch(() => {}),
      api.get('/reminders/today/').then((r) => setSchedule(r.data.data.schedule || [])).catch(() => {}),
      api.get('/wallet/').then((r) => setWallet(r.data.data.wallet)).catch(() => {}),
      api.get('/doctors/appointments/').then((r) => setAppointments(r.data.data.appointments || [])).catch(() => {}),
      api.get('/prescriptions/').then((r) => setPrescriptions(r.data.data.prescriptions || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const handleAddToCart = useCallback(async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCartLoading((p) => ({ ...p, [medId]: true }))
    try {
      await addToCart(medId, 1)
      toast.success('Added to cart')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not add to cart.')
    } finally {
      setCartLoading((p) => ({ ...p, [medId]: false }))
    }
  }, [addToCart])

  const handleWishlist = useCallback(async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    await toggleWishlist(medId)
  }, [toggleWishlist])

  const markTaken = useCallback(async (item: ReminderScheduleItem, key: string) => {
    setMarking(key)
    try {
      await api.post(`/reminders/${item.reminder_id}/mark-taken/`, { time: item.time })
      setSchedule((prev) => prev.map((i) =>
        i.reminder_id === item.reminder_id && i.time === item.time ? { ...i, taken: true } : i))
      toast.success('Marked taken')
    } catch {
      toast.error('Could not mark that dose. Try again.')
    } finally {
      setMarking(null)
    }
  }, [])

  const nowHHMM = now ? now.toTimeString().slice(0, 5) : null

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []

    for (const d of schedule) {
      const overdue = nowHHMM != null && d.time <= nowHHMM
      const key = `dose-${d.reminder_id}-${d.time}`
      out.push({
        key,
        time: d.time,
        state: d.taken ? 'done' : overdue ? 'due' : 'ahead',
        icon: 'medication',
        title: d.medicine_name,
        detail: d.dosage || undefined,
        // Any dose still untaken can be ticked off, whether or not the clock has passed it — people
        // take the 08:00 tablet at 07:55, and gating the tick on "overdue" left the card with
        // nothing to press for most of the day. `overdue` still drives the colour, which is about
        // what needs your attention, not about what you're allowed to do.
        markTaken: d.taken ? undefined : () => markTaken(d, key),
      })
    }

    if (now) {
      const today = localDateKey(now)
      for (const a of appointments) {
        if (a.scheduled_date !== today || !APPT_LIVE.has(a.status)) continue
        out.push({
          key: `appt-${a.id}`,
          time: firstClockTime(a.time_slot),
          state: 'moving',
          icon: 'stethoscope',
          title: `Dr. ${a.doctor?.name || 'your doctor'}`,
          detail: a.time_slot ? `Video consult, ${a.time_slot}` : 'Video consult',
          cta: { label: a.meeting_link ? 'Join' : 'Details', href: `/appointments/${a.id}` },
        })
      }
    }

    const live = orders.find((o) => !ORDER_SETTLED.has(o.status))
    if (live) {
      const needsYou = ORDER_NEEDS_YOU.has(live.status)
      out.push({
        key: `order-${live.id}`,
        time: null,
        state: needsYou ? 'needs-you' : 'moving',
        icon: needsYou ? 'error' : 'local_shipping',
        title: `Order ${live.id.slice(0, 8)}`,
        detail: ORDER_STATUS_LABEL[live.status] || live.status,
        cta: { label: needsYou ? 'Fix it' : 'Track', href: `/orders/${live.id}` },
      })
    }

    // Timed things in clock order; the order in flight has no hour of its own, so it tails the day.
    return out.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  }, [schedule, appointments, orders, now, nowHHMM, markTaken])

  // Index of the first entry still ahead of us — where the now-marker slots in.
  const markerAt = useMemo(() => {
    if (nowHHMM == null) return -1
    const timed = entries.filter((e) => e.time != null).length
    // Nothing on a clock today — an order in transit and an untimed appointment aren't a schedule,
    // so a "you are here" line would be pointing at a timeline that doesn't exist.
    if (timed === 0) return -1
    const i = entries.findIndex((e) => e.time != null && e.time > nowHHMM)
    return i === -1 ? timed : i
  }, [entries, nowHHMM])

  const doseCount = schedule.length
  const doseTaken = schedule.filter((d) => d.taken).length

  const buyAgain = useMemo(() => {
    const seen = new Set<string>()
    const out: Medicine[] = []
    for (const o of orders) {
      for (const it of o.items || []) {
        const m = it.medicine
        if (!m?.id || seen.has(m.id)) continue
        seen.add(m.id)
        out.push(m)
        if (out.length >= 12) return out
      }
    }
    return out
  }, [orders])

  const openRx = prescriptions.filter((p) => p.status === 'PENDING' || p.status === 'VERIFIED').length

  const account = [
    { label: 'Wallet', href: '/wallet', icon: 'account_balance_wallet', value: `NPR ${Number(wallet?.balance || 0).toFixed(0)}` },
    { label: 'Orders', href: '/orders', icon: 'package_2', value: String(orders.length) },
    { label: 'Prescriptions', href: '/prescriptions', icon: 'description', value: String(openRx) },
    { label: 'Saved', href: '/wishlist', icon: 'favorite', value: String(wishlistIds.length) },
  ]

  return (
    <div className="space-y-8">
      <div className="max-w-4xl space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl sm:text-[1.7rem] font-semibold tracking-tight text-on-surface">
            {now ? greeting(now.getHours()) : 'Welcome back'}
            {user && <>, {user.full_name.split(' ')[0]}</>}
          </h1>
          {now && (
            <p className="font-display text-sm text-on-surface-variant tabular-nums flex-shrink-0">
              {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>

        <section className="bg-surface rounded-2xl border border-outline-variant px-4 sm:px-5 py-4">
          <div className="flex items-baseline justify-between gap-4 mb-1">
            <h2 className="font-display text-lg font-semibold text-on-surface">Today</h2>
            {doseCount > 0 && (
              <p className="text-xs text-on-surface-variant tabular-nums">
                {doseTaken} of {doseCount} doses taken
              </p>
            )}
          </div>

          {loading ? (
            <div className="space-y-3 pt-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-11 bg-surface-container rounded" />
                  <div className="h-2.5 w-2.5 bg-surface-container rounded-full" />
                  <div className="h-3 bg-surface-container rounded flex-1 max-w-[14rem]" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="pt-2 pb-1">
              <p className="text-sm text-on-surface">Nothing scheduled today.</p>
              <p className="text-xs text-on-surface-variant mt-1 mb-3">
                Set a dose reminder or upload a prescription and it will show up here.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/reminders" className="btn btn-sm btn-primary">Set a reminder</Link>
                <Link href="/prescriptions" className="btn btn-sm btn-outline">Upload a prescription</Link>
              </div>
            </div>
          ) : (
            <ol className="relative pt-2">
              {/* One continuous rail behind the nodes. left = col 1 (3.25rem) + gap (0.75rem) +
                  half of col 2 (0.625rem); top/bottom inset lands on the first and last node. */}
              <span aria-hidden className="absolute left-[4.625rem] top-5 bottom-5 w-px bg-outline-variant" />

              {entries.map((e, i) => (
                <li key={e.key}>
                  {i === markerAt && nowHHMM && <NowMarker time={nowHHMM} />}
                  <div className="grid grid-cols-[3.25rem_1.25rem_1fr] gap-x-3 py-2.5 items-start">
                    <time className={`font-display text-sm tabular-nums text-right leading-5 ${
                      e.state === 'due' ? 'text-warning font-semibold' : e.state === 'done' ? 'text-on-surface-variant' : 'text-on-surface'
                    }`}>
                      {e.time || ''}
                    </time>
                    <span className="flex justify-center items-center h-5">
                      <span aria-hidden className={`rounded-full ${NODE[e.state]}`} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {/* line-clamp, not truncate: a timeline row can afford a second line, and
                              "Metfor…" tells you nothing about which medicine is due. */}
                          <p className={`text-sm leading-5 line-clamp-2 ${
                            e.state === 'done' ? 'text-on-surface-variant' : 'text-on-surface font-medium'
                          }`}>
                            <span className="material-symbols-outlined align-[-4px] mr-1.5 text-on-surface-variant" style={{ fontSize: '17px' }}>
                              {e.icon}
                            </span>
                            {e.title}
                          </p>
                          {e.detail && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{e.detail}</p>}
                        </div>
                        {/* A dose is a thing you tick off, so it gets a tick — not a filled button
                            repeated down the column, which shouted over the now-marker and squeezed
                            the medicine name to "Metfor…" on a phone. Same slot, same size, whether
                            it's already taken or waiting for you. */}
                        {e.state === 'done' && (
                          <span className="flex-shrink-0 -my-1 w-10 h-10 grid place-items-center text-success">
                            <span aria-hidden className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>check_circle</span>
                            <span className="sr-only">Taken</span>
                          </span>
                        )}
                        {e.markTaken && (
                          <button onClick={e.markTaken} disabled={marking === e.key}
                            aria-label={`Mark ${e.title} taken`}
                            className="flex-shrink-0 -my-1 w-10 h-10 grid place-items-center rounded-full text-on-surface-variant hover:text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 transition-colors">
                            <span aria-hidden className="material-symbols-outlined" style={{ fontSize: '22px' }}>check_circle</span>
                          </button>
                        )}
                        {e.cta && (
                          <Link href={e.cta.href} className="text-xs font-semibold text-primary hover:underline flex-shrink-0 pt-0.5">
                            {e.cta.label}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-outline-variant rounded-2xl border border-outline-variant overflow-hidden">
          {account.map((a) => (
            <Link key={a.label} href={a.href} className="bg-surface px-4 py-3 hover:bg-surface-container-low transition-colors">
              <dd className="font-display text-lg font-semibold text-on-surface tabular-nums truncate">
                {loading ? '—' : a.value}
              </dd>
              <dt className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{a.icon}</span>
                {a.label}
              </dt>
            </Link>
          ))}
        </dl>
      </div>

      {(loading || buyAgain.length > 0) && (
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-display text-lg font-semibold text-on-surface">Buy again</h2>
            <Link href="/orders" className="text-xs font-semibold text-primary hover:underline ml-auto">
              Order history
            </Link>
          </div>
          <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel="previously ordered">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-44 sm:w-52 flex-shrink-0"><MedicineCardSkeleton /></div>
              ))
            ) : (
              buyAgain.map((m) => (
                <div key={m.id} className="w-44 sm:w-52 flex-shrink-0">
                  <MedicineCard
                    medicine={m}
                    inWishlist={wishlistIds.includes(m.id)}
                    cartLoading={cartLoading[m.id]}
                    onToggleWishlist={handleWishlist}
                    onAddToCart={handleAddToCart}
                  />
                </div>
              ))
            )}
          </CarouselRow>
        </section>
      )}
    </div>
  )
}

// The one piece of emphasis on the page: where you actually are in your day.
function NowMarker({ time }: { time: string }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] gap-x-3 items-center py-1" aria-hidden>
      <span className="font-display text-[11px] font-semibold tabular-nums text-warning text-right">{time}</span>
      <span className="h-px bg-warning/50" />
    </div>
  )
}
