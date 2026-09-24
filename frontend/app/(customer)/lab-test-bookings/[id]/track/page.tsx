'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import api from '@/lib/api'
import type { LabTestBooking, CollectorTracking } from '@/types'

const LiveTrackingMap = dynamic(() => import('@/components/map/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

const POLL_INTERVAL_MS = 10000

// The point at which the collector is no longer on their way to you — either they've been and
// gone, or the booking is off. The backend stops returning coordinates at exactly these statuses
// (lab_collection.LIVE_TRACKING_STATUSES), so there is nothing left to poll for.
const DONE_STATUSES = ['SAMPLE_COLLECTED', 'SUBMITTED_TO_LAB', 'REPORT_READY', 'CANCELLED']

const STEPS = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'SAMPLE_COLLECTED'] as const
const STEP_CFG: Record<string, { label: string; blurb: string; icon: string }> = {
  CONFIRMED:        { label: 'Confirmed',   blurb: 'A collector has been assigned to your booking.', icon: 'check_circle' },
  EN_ROUTE:         { label: 'On the way',  blurb: 'Your collector is heading to your address.',     icon: 'directions_car' },
  ARRIVED:          { label: 'Arrived',     blurb: 'Your collector is at your door.',                icon: 'pin_drop' },
  SAMPLE_COLLECTED: { label: 'Collected',   blurb: 'Your sample has been collected.',                icon: 'vaccines' },
}

function CollectionStepper({ status }: { status: string }) {
  const stepIndex = STEPS.indexOf(status as typeof STEPS[number])
  if (stepIndex === -1) return null
  return (
    <div className="flex items-center gap-1 mt-2">
      {STEPS.map((step) => (
        <div key={step} className={`h-1.5 flex-1 rounded-full ${STEPS.indexOf(step) <= stepIndex ? 'bg-primary' : 'bg-surface-container-high'}`} />
      ))}
    </div>
  )
}

export default function TrackCollectorPage() {
  const { id } = useParams<{ id: string }>()
  const [booking, setBooking] = useState<LabTestBooking | null>(null)
  const [tracking, setTracking] = useState<CollectorTracking | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.get(`/lab-tests/bookings/${id}/`).then((r) => setBooking(r.data.data.booking)).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const loadTracking = useCallback(() => {
    api.get(`/lab-tests/bookings/${id}/tracking/`).then((r) => {
      const t: CollectorTracking | null = r.data.data.tracking || null
      setTracking(t)
      if (t && DONE_STATUSES.includes(t.status) && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }).catch(() => {})
  }, [id])

  useEffect(() => {
    loadTracking()
    pollRef.current = setInterval(loadTracking, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [loadTracking])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!booking) return (
    <div className="text-center py-24">
      <p className="text-on-surface-variant">Booking not found.</p>
      <Link href="/lab-test-bookings" className="text-sm text-primary hover:underline mt-2 block">Back to Bookings</Link>
    </div>
  )

  // Tracking is the live source of truth for status — the booking itself was fetched once, so it
  // goes stale the moment the collector advances.
  const status = tracking?.status || booking.status
  const collector = tracking?.collector
  const isCancelled = status === 'CANCELLED'
  const isCollected = status === 'SAMPLE_COLLECTED' || status === 'SUBMITTED_TO_LAB' || status === 'REPORT_READY'
  const step = STEP_CFG[status]
  const hasCollectorLocation = !!collector && collector.lat != null && collector.lng != null
  const destination = booking.address?.lat != null && booking.address?.lng != null
    ? { lat: booking.address.lat, lng: booking.address.lng }
    : null

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/lab-test-bookings" className="hover:text-primary transition-colors">Lab Tests</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Track</span>
      </div>

      {/* Header card */}
      <div className={`rounded-2xl p-6 text-white ${isCollected ? 'bg-gradient-to-r from-primary to-primary/80' : isCancelled ? 'bg-gradient-to-r from-error to-error/80' : 'bg-gradient-to-r from-secondary to-secondary/80'}`}>
        <p className="text-sm font-medium opacity-80">{booking.lab_test?.name}</p>
        <h1 className="text-2xl font-bold mt-1">
          {isCollected ? 'Sample Collected' : isCancelled ? 'Booking Cancelled' : step?.label || status.replace(/_/g, ' ')}
        </h1>
        <p className="text-sm opacity-70 mt-1">
          {isCancelled ? 'This booking has been cancelled.' : step?.blurb || 'We\'ll keep you updated as your collection moves forward.'}
        </p>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs opacity-70">Scheduled</p>
            <p className="text-sm font-semibold">{new Date(booking.scheduled_date).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div>
            <p className="text-xs opacity-70">Time Slot</p>
            <p className="text-sm font-semibold">{booking.time_slot}</p>
          </div>
          <div>
            <p className="text-xs opacity-70">Amount</p>
            <p className="text-sm font-semibold">NPR {Number(booking.total_amount).toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Collector card. Shown as soon as one is assigned — the patient can reach whoever is
          committed to the collection even before they set out. The map appears only once the
          collector's browser is actually reporting coordinates; it stops once they've collected
          the sample and moved on to other patients. */}
      {!isCancelled && collector && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-on-surface">Your Collector</p>
            {step && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap bg-secondary/10 text-secondary">
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{step.icon}</span>
                {step.label}
              </span>
            )}
          </div>

          <CollectionStepper status={status} />

          {hasCollectorLocation && (
            <div className="h-56 rounded-xl overflow-hidden border border-outline-variant">
              <LiveTrackingMap
                riderPosition={{ lat: collector.lat as number, lng: collector.lng as number }}
                destination={destination}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '20px' }}>badge</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{collector.name}</p>
                {collector.phone && <a href={`tel:${collector.phone}`} className="text-xs text-primary hover:underline">{collector.phone}</a>}
              </div>
            </div>
            {tracking?.distance_km != null && tracking?.eta_minutes != null && (
              <p className="text-xs font-medium text-on-surface-variant text-right">
                ~{tracking.distance_km} km away
                <br />
                <span className="text-primary font-semibold">~{tracking.eta_minutes} min</span> (estimate)
              </p>
            )}
          </div>

          {status === 'CONFIRMED' && !hasCollectorLocation && (
            <p className="text-[11px] text-blue-600 flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
              The live map appears once your collector sets out
            </p>
          )}
        </div>
      )}

      {!isCancelled && !collector && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 text-center">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '28px' }}>person_search</span>
          <p className="text-sm font-semibold text-on-surface mt-1">No collector assigned yet</p>
          <p className="text-xs text-on-surface-variant mt-0.5">You&apos;ll be notified as soon as one is on the way.</p>
        </div>
      )}

      {/* Collection address */}
      {booking.address && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Collection Address</p>
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined ms-filled text-secondary mt-0.5" style={{ fontSize: '18px' }}>location_on</span>
            <div className="text-sm text-on-surface-variant space-y-0.5">
              <p className="font-medium text-on-surface">{booking.patient_name || booking.address.full_name}</p>
              <p>{booking.address.address_line1}</p>
              <p>{booking.address.city}, {booking.address.state}</p>
              <p>{booking.address.phone}</p>
            </div>
          </div>
        </div>
      )}

      <Link href="/lab-test-bookings" className="block py-3 border border-outline-variant rounded-2xl text-sm font-semibold text-on-surface text-center hover:border-primary hover:text-primary transition-colors">
        Back to Bookings
      </Link>
    </div>
  )
}
