'use client'
import { getNotificationCfg, notificationTimeAgo } from '@/lib/notificationDisplay'
import type { Notification } from '@/types'

interface Props {
  notif: Notification
  onClick: () => void
  onDismiss: () => void
}

export default function NotificationToast({ notif, onClick, onDismiss }: Props) {
  const cfg = getNotificationCfg(notif.type)
  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 bg-surface border border-outline-variant rounded-2xl shadow-2xl p-4 w-80 cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface leading-snug">{notif.title}</p>
        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed line-clamp-2">{notif.message}</p>
        <p className="text-[10px] text-on-surface-variant/60 mt-1">{notificationTimeAgo(notif.created_at)}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }}
        className="p-1 rounded-lg hover:bg-surface-container-highest transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '14px' }}>close</span>
      </button>
    </div>
  )
}
