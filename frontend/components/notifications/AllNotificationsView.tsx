'use client'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'
import { getNotificationCfg, notificationTimeAgo } from '@/lib/notificationDisplay'
import type { Notification } from '@/types'

export default function AllNotificationsView() {
  const router = useRouter()
  const { notifs, loading, unread, markRead, markAllRead, deleteOne } = useNotifications()

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Notifications</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {unread > 0 ? `You have ${unread} unread notification${unread > 1 ? 's' : ''}.` : 'You are all caught up.'}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-sm font-semibold rounded-xl text-on-surface hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>done_all</span>Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '48px' }}>notifications_none</span>
          <p className="text-base font-semibold text-on-surface mt-3">All caught up!</p>
          <p className="text-sm text-on-surface-variant mt-1">You have no notifications yet.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {notifs.map((n) => {
            const cfg = getNotificationCfg(n.type)
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`group flex items-start gap-4 px-4 sm:px-5 py-4 hover:bg-surface-container-low transition-colors relative ${n.link ? 'cursor-pointer' : ''} ${!n.is_read ? 'bg-primary/[0.03]' : ''}`}
              >
                {!n.is_read && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{cfg.icon}</span>
                </div>
                <div className="flex-1 min-w-0 pr-8">
                  <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>
                    {n.title}
                  </p>
                  <p className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-[11px] text-on-surface-variant/60 mt-1.5">{notificationTimeAgo(n.created_at)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteOne(n.id) }}
                  className="absolute right-3 top-4 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-container-highest transition-all"
                  aria-label="Delete notification"
                >
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>close</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
