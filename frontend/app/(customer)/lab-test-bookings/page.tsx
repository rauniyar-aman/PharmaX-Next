'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTestBooking } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  SAMPLE_COLLECTED: 'bg-primary/10 text-primary',
  REPORT_READY: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

const STATUS_ICONS: Record<string, string> = {
  PENDING: 'hourglass_empty',
  CONFIRMED: 'check_circle',
  SAMPLE_COLLECTED: 'vaccines',
  REPORT_READY: 'description',
  CANCELLED: 'cancel',
}

export default function LabTestBookingsPage() {
  const [bookings, setBookings] = useState<LabTestBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = () => {
    api.get('/lab-tests/bookings/').then((r) => setBookings(r.data.data.bookings || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this lab test booking?')) return
    setCancelling(id)
    try {
      await api.put(`/lab-tests/bookings/${id}/`, { status: 'CANCELLED' })
      toast.success('Booking cancelled.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not cancel booking.')
    } finally {
      setCancelling(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!bookings.length) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>biotech</span>
      <h2 className="text-xl font-bold text-on-surface">No lab test bookings yet</h2>
      <p className="text-sm text-on-surface-variant">Your booked lab tests will appear here</p>
      <Link href="/lab-tests" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Browse Lab Tests
      </Link>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Lab Test Bookings</h1>
        <span className="text-sm text-on-surface-variant">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-on-surface">{b.lab_test?.name}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{b.lab_test?.category_name}</p>
              </div>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status] || 'bg-surface-container text-on-surface-variant'}`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>{STATUS_ICONS[b.status]}</span>
                {b.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-on-surface-variant">Date</p>
                <p className="font-medium text-on-surface mt-0.5">{new Date(b.scheduled_date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Time Slot</p>
                <p className="font-medium text-on-surface mt-0.5">{b.time_slot}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Amount</p>
                <p className="font-medium text-on-surface mt-0.5">NPR {Number(b.total_amount).toFixed(0)}</p>
              </div>
              <div>
                <p className="text-on-surface-variant">Address</p>
                <p className="font-medium text-on-surface mt-0.5 truncate">{b.address?.city || '—'}</p>
              </div>
            </div>
            {b.status === 'REPORT_READY' && b.report_url && (
              <a href={b.report_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                View Report
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
              </a>
            )}
            {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
              <button onClick={() => handleCancel(b.id)} disabled={cancelling === b.id}
                className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                {cancelling === b.id ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
