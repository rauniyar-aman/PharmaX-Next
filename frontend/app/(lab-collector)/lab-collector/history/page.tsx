'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { LabTestBooking } from '@/types'

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// History only ever holds the two terminal states the active list drops — kept visually distinct:
// a completed collection reads as a win (green), a cancelled one as closed-out (error tone).
const STATUS_PILL: Record<string, { label: string; color: string; icon: string }> = {
  REPORT_READY: { label: 'Completed', color: 'bg-emerald-50 text-emerald-600', icon: 'task_alt' },
  CANCELLED:    { label: 'Cancelled', color: 'bg-error/10 text-error',         icon: 'cancel' },
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  KHALTI: 'Khalti',
  ESEWA: 'eSewa',
  CASH_ON_DELIVERY: 'Cash on Collection',
}

export default function LabCollectorHistoryPage() {
  const [bookings, setBookings] = useState<LabTestBooking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/lab-collector/history/').then((r) => setBookings(r.data.data.collections || []))
      .catch(() => toast.error('Failed to load collection history.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Collection History</h1>
        <p className="text-sm text-on-surface-variant mt-1">Collections you've completed or that were cancelled — most recent first.</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>history</span>
          <p className="mt-2 text-sm">No past collections yet — completed and cancelled jobs will show up here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const pill = STATUS_PILL[b.status] || { label: b.status.replace(/_/g, ' '), color: 'bg-surface-container text-on-surface-variant', icon: 'science' }
            const reportHref = b.report_file_url ? resolveImg(b.report_file_url) : (b.report_url || null)
            return (
              <div key={b.id} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">{b.lab_test?.name}</p>
                    <p className="text-sm font-bold text-on-surface mt-0.5">{b.user?.full_name || 'Patient'}</p>
                    {b.user?.phone && <a href={`tel:${b.user.phone}`} className="text-xs text-primary hover:underline">{b.user.phone}</a>}
                    {b.patient_name && <p className="text-xs text-secondary mt-0.5">Sample from {b.patient_name}</p>}
                  </div>
                  <span className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${pill.color}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{pill.icon}</span>
                    {pill.label}
                  </span>
                </div>

                {b.address && (
                  <p className="text-xs text-on-surface-variant flex items-start gap-1">
                    <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: '14px' }}>location_on</span>
                    {b.address.address_line1}, {b.address.city}
                  </p>
                )}

                <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>calendar_month</span>
                    {fmtDate(b.scheduled_date)} · {b.time_slot}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>payments</span>
                    NPR {Number(b.total_amount).toFixed(0)}{b.payment_method ? ` · ${PAYMENT_METHOD_LABEL[b.payment_method] || b.payment_method}` : ''}
                  </span>
                </div>

                {b.status === 'REPORT_READY' && reportHref && (
                  <a href={reportHref} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                    View Report
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
