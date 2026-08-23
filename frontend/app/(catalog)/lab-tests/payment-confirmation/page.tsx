'use client'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import type { LabTestBooking } from '@/types'

function LabTestPaymentConfirmedContent() {
  const searchParams = useSearchParams()
  const [booking, setBooking] = useState<LabTestBooking | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bookingId = searchParams.get('bookingId')
    if (!bookingId) { setLoading(false); return }
    api.get(`/lab-tests/bookings/${bookingId}/`).then((r) => setBooking(r.data.data.booking)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '48px' }}>check_circle</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Booking Confirmed!</h1>
        <p className="text-sm text-on-surface-variant mt-2">Payment received — your sample collection is booked.</p>
      </div>
      {booking && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Test</span>
            <span className="font-medium text-on-surface">{booking.lab_test.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Date</span>
            <span className="text-on-surface">{new Date(booking.scheduled_date).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Time</span>
            <span className="text-on-surface">{booking.time_slot}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Amount Paid</span>
            <span className="text-on-surface font-bold">NPR {Number(booking.total_amount).toFixed(0)}</span>
          </div>
        </div>
      )}
      <Link href="/lab-test-bookings"
        className="inline-block w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
        View My Bookings
      </Link>
    </div>
  )
}

export default function LabTestPaymentConfirmedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <LabTestPaymentConfirmedContent />
    </Suspense>
  )
}
