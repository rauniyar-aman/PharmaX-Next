'use client'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import type { LabBookingGroup } from '@/types'

function LabCartConfirmationContent() {
  const searchParams = useSearchParams()
  const [group, setGroup] = useState<LabBookingGroup | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const groupId = searchParams.get('groupId')
    if (!groupId) { setLoading(false); return }
    api.get(`/lab-tests/bookings/groups/${groupId}/`).then((r) => setGroup(r.data.data.group)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  const paid = group?.payment_status === 'PAID'

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '48px' }}>check_circle</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Booking Confirmed!</h1>
        <p className="text-sm text-on-surface-variant mt-2">
          {paid ? 'Payment received — your sample collection is booked.' : 'Your sample collection is booked. Pay by cash when the collector arrives.'}
        </p>
      </div>
      {group && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 text-left space-y-3">
          <div className="space-y-2">
            {group.bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-on-surface flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-on-surface-variant shrink-0" style={{ fontSize: '18px' }}>{b.lab_test.is_package ? 'inventory_2' : 'biotech'}</span>
                  <span className="truncate">{b.lab_test.name}{b.patient_name ? ` · ${b.patient_name}` : ''}</span>
                </span>
                <span className="font-medium text-on-surface shrink-0">NPR {Number(b.total_amount).toFixed(0)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-outline-variant pt-3 space-y-2">
            {group.bookings[0] && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Date</span>
                  <span className="text-on-surface">{new Date(group.bookings[0].scheduled_date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Time</span>
                  <span className="text-on-surface">{group.bookings[0].time_slot}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">{paid ? 'Amount Paid' : 'Amount Due'}</span>
              <span className="text-on-surface font-bold">NPR {Number(group.total_amount).toFixed(0)}</span>
            </div>
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

export default function LabCartConfirmationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <LabCartConfirmationContent />
    </Suspense>
  )
}
