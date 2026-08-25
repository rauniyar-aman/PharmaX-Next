'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useWishlist } from '@/hooks/useWishlist'
import { useCart } from '@/hooks/useCart'
import TabbedProductRail from '@/components/home/TabbedProductRail'
import OurServicesSection from '@/components/home/OurServicesSection'
import FeaturedDealsRail from '@/components/home/FeaturedDealsRail'
import type { Order, ReminderScheduleItem, Wallet } from '@/types'

const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'Awaiting Prescription', PRESCRIPTION_REJECTED: 'Prescription Rejected',
  BROADCASTING: 'Finding a Pharmacy', AWAITING_PAYMENT: 'Awaiting Payment', NO_PHARMACY_FOUND: 'No Pharmacy Found',
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PROCESSING: 'Processing', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', RETURNED: 'Returned',
}

// today's reminder/today/ schedule is already sorted by time — "next" is the first untaken dose
// still ahead of now, falling back to the first untaken dose overall (already overdue) if none is.
function nextReminder(schedule: ReminderScheduleItem[]): { primary: string; secondary?: string } {
  if (schedule.length === 0) return { primary: 'No reminders today' }
  const nowHHMM = new Date().toTimeString().slice(0, 5)
  const next = schedule.find((i) => !i.taken && i.time >= nowHHMM) || schedule.find((i) => !i.taken)
  if (!next) return { primary: 'All doses taken', secondary: 'Nice work today' }
  return { primary: next.medicine_name, secondary: `at ${next.time}` }
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { wishlistIds, toggle: toggleWishlist } = useWishlist()
  const { addToCart } = useCart()
  const [cartLoading, setCartLoading] = useState<Record<string, boolean>>({})

  const [recentOrder, setRecentOrder] = useState<Order | null>(null)
  const [reminderSchedule, setReminderSchedule] = useState<ReminderScheduleItem[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)

  // Reuses the exact same endpoints the Orders / Reminders / Wallet pages already fetch from —
  // no second order-status lookup, no parallel reminders model, just the same data read here too.
  useEffect(() => {
    Promise.all([
      api.get('/orders/').then((r) => setRecentOrder((r.data.data.orders || [])[0] || null)).catch(() => {}),
      api.get('/reminders/today/').then((r) => setReminderSchedule(r.data.data.schedule || [])).catch(() => {}),
      api.get('/wallet/').then((r) => setWallet(r.data.data.wallet)).catch(() => {}),
    ]).finally(() => setSummaryLoading(false))
  }, [])

  const handleAddToCart = useCallback(async (medId: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCartLoading((p) => ({ ...p, [medId]: true }))
    try {
      await addToCart(medId, 1)
      toast.success('Added to cart!')
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

  const reminder = nextReminder(reminderSchedule)

  const cards: { icon: string; color: string; href: string; label: string; value: string; sub?: string }[] = [
    {
      icon: 'receipt_long', color: 'bg-blue-50 text-blue-600',
      href: recentOrder ? `/orders/${recentOrder.id}` : '/orders',
      label: 'Recent Order',
      value: summaryLoading ? '—' : recentOrder ? (ORDER_STATUS_LABEL[recentOrder.status] || recentOrder.status) : 'No orders yet',
    },
    {
      icon: 'alarm', color: 'bg-amber-50 text-amber-600', href: '/reminders',
      label: 'Next Reminder',
      value: summaryLoading ? '—' : reminder.primary,
      sub: reminder.secondary,
    },
    {
      icon: 'account_balance_wallet', color: 'bg-emerald-50 text-emerald-600', href: '/wallet',
      label: 'Wallet Balance',
      value: summaryLoading ? '—' : `NPR ${Number(wallet?.balance || 0).toFixed(0)}`,
    },
    {
      icon: 'favorite', color: 'bg-rose-50 text-rose-600', href: '/wishlist',
      label: 'Wishlist',
      value: `${wishlistIds.length} item${wishlistIds.length === 1 ? '' : 's'}`,
    },
  ]

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold text-on-surface mb-3">
          {user ? `Welcome back, ${user.full_name.split(' ')[0]}` : 'Welcome back'}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href}
              className="bg-surface rounded-2xl border border-outline-variant p-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color} mb-3`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{c.icon}</span>
              </div>
              <p className="text-sm font-bold text-on-surface truncate">{c.value}</p>
              {c.sub && <p className="text-[11px] text-on-surface-variant">{c.sub}</p>}
              <p className="text-xs text-on-surface-variant mt-0.5">{c.label}</p>
            </Link>
          ))}
        </div>
      </div>

      <TabbedProductRail
        wishlistIds={wishlistIds}
        onToggleWishlist={handleWishlist}
        onAddToCart={handleAddToCart}
        cartLoading={cartLoading}
      />

      <OurServicesSection />

      <FeaturedDealsRail
        wishlistIds={wishlistIds}
        onToggleWishlist={handleWishlist}
        onAddToCart={handleAddToCart}
        cartLoading={cartLoading}
      />
    </div>
  )
}
