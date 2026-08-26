'use client'
import { useRouter } from 'next/navigation'
import { getNotificationCfg, notificationTimeAgo } from '@/lib/notificationDisplay'
import type { Notification } from '@/types'

interface Props {
  notifs: Notification[]
  loading: boolean
  unread: number
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onDeleteOne: (id: string) => void
  onClearAll: () => void
  onClose?: () => void
}

export default function NotificationPanel({
  notifs, loading, unread,
  onMarkRead, onMarkAllRead, onDeleteOne, onClearAll, onClose,
}: Props) {
  const router = useRouter()

  const handleClick = async (n: Notification) => {
    if (!n.is_read) onMarkRead(n.id)
    if (n.link) { router.push(n.link); onClose?.() }
  }

  return (
    <div className="flex flex-col max-h-[480px]">
      <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-on-surface">Notifications</p>
          {unread > 0 && (
            <span className="px-1.5 py-0.5 bg-error text-white text-[10px] font-bold rounded-full">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button onClick={onMarkAllRead} className="text-[11px] text-secondary font-semibold hover:underline">
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button onClick={onClearAll} className="text-[11px] text-on-surface-variant hover:text-error transition-colors">
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto">
        {loading ? (
          <div className="space-y-1 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-3 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-surface-container flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-surface-container rounded w-3/4" />
                  <div className="h-2.5 bg-surface-container rounded w-full" />
                  <div className="h-2 bg-surface-container rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '44px' }}>notifications_none</span>
            <p className="text-sm font-semibold text-on-surface mt-3">All caught up!</p>
            <p className="text-xs text-on-surface-variant mt-1">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {notifs.map((n) => {
              const cfg = getNotificationCfg(n.type)
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`group flex items-start gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors cursor-pointer relative ${!n.is_read ? 'bg-primary/[0.03]' : ''}`}
                >
                  {!n.is_read && (
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                  )}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-on-surface-variant/60 mt-1">{notificationTimeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteOne(n.id) }}
                    className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-surface-container-highest transition-all"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '14px' }}>close</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
