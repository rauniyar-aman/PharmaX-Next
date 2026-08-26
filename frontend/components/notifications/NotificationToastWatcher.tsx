'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import NotificationToast from './NotificationToast'
import type { Notification } from '@/types'

const POLL_MS = 15000

/** Facebook-style popup for any new Notification row, for every logged-in role. Renders nothing
 * itself — bottom-right toasts come from react-hot-toast's single shared <Toaster/> in Providers. */
export default function NotificationToastWatcher() {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  // null = baseline not established yet for this login; first poll after (re)login just records
  // what's already there so opening the app doesn't toast-bomb the existing backlog.
  const seenRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!user) {
      seenRef.current = null
      return
    }

    let cancelled = false

    const poll = () => {
      api.get('/notifications/').then((r) => {
        if (cancelled) return
        const notifs: Notification[] = r.data.data.notifications || []
        if (!seenRef.current) {
          seenRef.current = new Set(notifs.map((n) => n.id))
          return
        }
        for (const n of notifs) {
          if (seenRef.current.has(n.id) || n.is_read) continue
          seenRef.current.add(n.id)
          toast.custom(
            (t) => (
              <NotificationToast
                notif={n}
                onClick={() => {
                  api.put(`/notifications/${n.id}/`).catch(() => {})
                  if (n.link) router.push(n.link)
                  toast.dismiss(t.id)
                }}
                onDismiss={() => toast.dismiss(t.id)}
              />
            ),
            { id: `notif-${n.id}`, duration: 6000, position: 'bottom-right' },
          )
        }
      }).catch(() => {})
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [user, router])

  return null
}
