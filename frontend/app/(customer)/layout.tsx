'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import PublicHeader from '@/components/common/PublicHeader'
import { playNotificationChime, installAudioUnlockOnFirstInteraction } from '@/lib/notificationSound'
import type { ReminderScheduleItem, DoctorAppointment } from '@/types'

const REMINDER_POLL_MS = 60000
// how far past its scheduled time a dose can be before we stop nudging about it — long enough to
// catch "just opened the tab a few minutes late," short enough not to resurface hours-old doses.
const REMINDER_DUE_WINDOW_MIN = 10

function DueReminderToast({ item, onMarkTaken, onDismiss }: {
  item: ReminderScheduleItem; onMarkTaken: () => void; onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-3 bg-surface border-2 border-primary rounded-2xl shadow-2xl p-4 w-80">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '22px' }}>medication</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface">Time for {item.medicine_name}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{item.dosage ? `${item.dosage} · ` : ''}Scheduled for {item.time}</p>
        <div className="flex gap-2 mt-2">
          <button onClick={onMarkTaken} className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity">
            Mark as Taken
          </button>
          <button onClick={onDismiss} className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

function DueFollowUpToast({ appt, onSeeDoctor, onDismiss }: {
  appt: DoctorAppointment; onSeeDoctor: () => void; onDismiss: () => void
}) {
  const overdue = appt.follow_up_date! < new Date().toISOString().slice(0, 10)
  return (
    <div className="flex items-start gap-3 bg-surface border-2 border-primary rounded-2xl shadow-2xl p-4 w-80">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '22px' }}>event_repeat</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface">{overdue ? 'Follow-up overdue' : 'Follow-up due today'}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">
          Dr. {appt.doctor.name} recommended a follow-up{appt.follow_up_notes ? ` — ${appt.follow_up_notes}` : ''}.
        </p>
        <div className="flex gap-2 mt-2">
          <button onClick={onSeeDoctor} className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity">
            See Dr. {appt.doctor.name}
          </button>
          <button onClick={onDismiss} className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const alertedRef = useRef<Set<string>>(new Set())
  const followUpAlertedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
    // Unlocks the reminder chime's AudioContext on first interaction anywhere on the site —
    // see (pharmacy)/layout.tsx for why a setInterval-driven retry alone can never do this.
    installAudioUnlockOnFirstInteraction()
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  // Nudges the customer about a due dose while they have the app open — checks the "today's
  // schedule" endpoint (already frequency-aware: daily/weekly/monthly) on an interval and pops a
  // toast + chime the first time each dose crosses its scheduled time, skipping anything already
  // marked taken or too far in the past to still be useful.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'CUSTOMER') return

    const checkDue = () => {
      api.get('/reminders/today/').then((r) => {
        const schedule: ReminderScheduleItem[] = r.data.data.schedule || []
        const now = new Date()
        for (const item of schedule) {
          if (item.taken) continue
          const key = `${item.reminder_id}-${item.time}-${now.toDateString()}`
          if (alertedRef.current.has(key)) continue

          const [h, m] = item.time.split(':').map(Number)
          const scheduledAt = new Date(now)
          scheduledAt.setHours(h, m, 0, 0)
          const minutesPast = (now.getTime() - scheduledAt.getTime()) / 60000
          if (minutesPast < 0 || minutesPast > REMINDER_DUE_WINDOW_MIN) continue

          alertedRef.current.add(key)
          playNotificationChime()
          const toastId = `reminder-${key}`
          toast.custom(
            (t) => (
              <DueReminderToast
                item={item}
                onMarkTaken={() => {
                  api.post(`/reminders/${item.reminder_id}/mark-taken/`, { time: item.time }).catch(() => {})
                  toast.dismiss(t.id)
                }}
                onDismiss={() => toast.dismiss(t.id)}
              />
            ),
            { id: toastId, duration: 20000, position: 'top-right' },
          )
        }
      }).catch(() => {})
    }

    checkDue()
    const timer = setInterval(checkDue, REMINDER_POLL_MS)
    return () => clearInterval(timer)
  }, [hydrated, user])

  // Same polling/toast/chime pattern as the medicine-reminder check above, kept as its own effect
  // rather than folded into checkDue() — different data source (appointments, not reminders/today)
  // and different dedup shape, but conceptually the same kind of alert, not a new UX.
  useEffect(() => {
    if (!hydrated || !user || user.role !== 'CUSTOMER') return

    const checkFollowUps = () => {
      api.get('/doctors/appointments/').then((r) => {
        const appointments: DoctorAppointment[] = r.data.data.appointments || []
        const todayStr = new Date().toISOString().slice(0, 10)
        for (const appt of appointments) {
          if (!appt.follow_up_date || appt.follow_up_date > todayStr) continue // not due yet
          const key = `${appt.id}-${todayStr}`
          if (followUpAlertedRef.current.has(key)) continue

          followUpAlertedRef.current.add(key)
          playNotificationChime()
          const toastId = `follow-up-${key}`
          toast.custom(
            (t) => (
              <DueFollowUpToast
                appt={appt}
                onSeeDoctor={() => { router.push(`/doctor-consult/${appt.doctor.id}`); toast.dismiss(t.id) }}
                onDismiss={() => toast.dismiss(t.id)}
              />
            ),
            { id: toastId, duration: 20000, position: 'top-right' },
          )
        }
      }).catch(() => {})
    }

    checkFollowUps()
    const timer = setInterval(checkFollowUps, REMINDER_POLL_MS)
    return () => clearInterval(timer)
  }, [hydrated, user, router])

  if (!hydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user.role !== 'CUSTOMER') {
    const dashboard = user.role === 'ADMIN' ? '/admin/dashboard' : user.role === 'PHARMACY' ? '/pharmacy/dashboard' : user.role === 'LAB_COLLECTOR' ? '/lab-collector/active' : '/delivery/requests'
    router.replace(dashboard)
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="w-full px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
