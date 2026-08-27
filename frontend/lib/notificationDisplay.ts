export const NOTIFICATION_TYPE_CFG: Record<string, { icon: string; color: string }> = {
  ORDER_PLACED:           { icon: 'shopping_bag',   color: 'text-secondary bg-secondary/10' },
  ORDER_UPDATE:           { icon: 'local_shipping', color: 'text-primary bg-primary/10' },
  DELIVERY_OUT_FOR_DELIVERY: { icon: 'local_shipping', color: 'text-primary bg-primary/10' },
  DELIVERY_COMPLETED:     { icon: 'local_shipping', color: 'text-primary bg-primary/10' },
  PAYMENT_UPDATE:         { icon: 'payments',       color: 'text-primary bg-primary/10' },
  PRESCRIPTION_SUBMITTED: { icon: 'upload_file',    color: 'text-amber-600 bg-amber-100' },
  PRESCRIPTION_VERIFIED:  { icon: 'verified_user',  color: 'text-primary bg-primary/10' },
  PRESCRIPTION_REJECTED:  { icon: 'cancel',         color: 'text-error bg-error/10' },
  NEW_ORDER:              { icon: 'receipt_long',   color: 'text-secondary bg-secondary/10' },
  NEW_PRESCRIPTION:       { icon: 'description',    color: 'text-amber-600 bg-amber-100' },
  NEW_LAB_BOOKING:        { icon: 'biotech',         color: 'text-primary bg-primary/10' },
  NEW_APPOINTMENT:        { icon: 'stethoscope',     color: 'text-secondary bg-secondary/10' },
}

const DEFAULT_NOTIFICATION_CFG = { icon: 'info', color: 'text-on-surface-variant bg-surface-container' }

export function getNotificationCfg(type: string) {
  return NOTIFICATION_TYPE_CFG[type] || DEFAULT_NOTIFICATION_CFG
}

export function notificationTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
