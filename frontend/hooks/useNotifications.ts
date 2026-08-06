import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Notification } from '@/types'

export function useNotifications() {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((s) => s.user)

  const unread = notifs.filter((n) => !n.is_read).length

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await api.get('/notifications/')
      setNotifs(res.data.data.notifications || [])
    } catch {}
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const markRead = async (id: string) => {
    setNotifs((p) => p.map((n) => n.id === id ? { ...n, is_read: true } : n))
    try { await api.put(`/notifications/${id}/`) } catch {}
  }

  const markAllRead = async () => {
    setNotifs((p) => p.map((n) => ({ ...n, is_read: true })))
    try { await api.put('/notifications/read-all/') } catch {}
  }

  const deleteOne = async (id: string) => {
    setNotifs((p) => p.filter((n) => n.id !== id))
    try { await api.delete(`/notifications/${id}/`) } catch {}
  }

  const clearAll = async () => {
    setNotifs([])
    try { await api.delete('/notifications/clear-all/') } catch {}
  }

  return { notifs, loading, unread, markRead, markAllRead, deleteOne, clearAll, refetch: fetch }
}
