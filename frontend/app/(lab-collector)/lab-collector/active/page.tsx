'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTestBooking } from '@/types'

type LocationStatus = 'idle' | 'requesting' | 'sharing' | 'denied' | 'unsupported'

/** Inline amount-confirmation control for a COD collection — mirrors (delivery)'s
 * "Confirm Cash Collected" flow: the collector must type the exact amount they physically
 * received, which the backend then checks against booking.total_amount (collector_confirm_sample_collected()
 * rejects anything that doesn't match exactly, same defensive pattern as the delivery agent's own
 * collect-cash step). */
function ConfirmCollectedControl({ booking, busy, onConfirm }: {
  booking: LabTestBooking
  busy: boolean
  onConfirm: (bookingId: string, amountConfirmed?: string) => void
}) {
  const isCod = booking.payment_method === 'CASH_ON_DELIVERY'
  const [amount, setAmount] = useState('')

  if (!isCod) {
    return (
      <button onClick={() => onConfirm(booking.id)} disabled={busy}
        className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Confirm Sample Collected
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input type="number" inputMode="decimal" placeholder={`NPR ${booking.total_amount}`} value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28 px-3 py-2 text-xs rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40" />
      <button onClick={() => onConfirm(booking.id, amount)} disabled={busy || !amount}
        className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Confirm Cash Collected
      </button>
    </div>
  )
}

function UploadReportControl({ booking, busy, onUpload }: {
  booking: LabTestBooking
  busy: boolean
  onUpload: (bookingId: string, file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(booking.id, file)
          e.target.value = ''
        }} />
      <button onClick={() => inputRef.current?.click()} disabled={busy}
        className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Upload Report
      </button>
    </>
  )
}

/** The collector's linear step chain for a booking in the active list — each status shows where the
 * sample is and (below) the single action that advances it. Mirrors the backend guard chain in
 * lab_collection.py exactly: CONFIRMED → EN_ROUTE → ARRIVED → SAMPLE_COLLECTED → SUBMITTED_TO_LAB →
 * [report upload] → REPORT_READY. */
const STATUS_PILL: Record<string, { label: string; color: string }> = {
  CONFIRMED:        { label: 'Awaiting collection',              color: 'bg-amber-50 text-amber-600' },
  EN_ROUTE:         { label: 'On the way',                       color: 'bg-indigo-50 text-indigo-600' },
  ARRIVED:          { label: 'At the patient',                   color: 'bg-blue-50 text-blue-600' },
  SAMPLE_COLLECTED: { label: 'Sample collected',                color: 'bg-primary/10 text-primary' },
  SUBMITTED_TO_LAB: { label: 'Submitted to lab — awaiting report', color: 'bg-purple-50 text-purple-600' },
}

export default function LabCollectorActivePage() {
  const [bookings, setBookings] = useState<LabTestBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const watchIdRef = useRef<number | null>(null)

  const load = () => {
    api.get('/lab-collector/active/').then((r) => setBookings(r.data.data.collections || [])).catch(() => toast.error('Failed to load active collections.')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Share live location while there's an active collection to track against — same reasoning as
  // (delivery)'s Active page: the patient relies on this to see the collector coming.
  useEffect(() => {
    if (bookings.length === 0) return
    if (!('geolocation' in navigator)) { setLocationStatus('unsupported'); return }

    setLocationStatus('requesting')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationStatus('sharing')
        api.patch('/lab-collector/location/', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {})
      },
      (err) => {
        setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported')
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [bookings.length])

  const confirmCollected = async (bookingId: string, amountConfirmed?: string) => {
    setBusyId(bookingId)
    try {
      await api.post(`/lab-collector/active/${bookingId}/confirm-collected/`, amountConfirmed !== undefined ? { amount_confirmed: amountConfirmed } : {})
      toast.success('Sample collection confirmed.')
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'SAMPLE_COLLECTED', payment_status: 'PAID' } : b)))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to confirm collection.')
    } finally {
      setBusyId(null)
    }
  }

  const markEnRoute = async (bookingId: string) => {
    setBusyId(bookingId)
    try {
      await api.post(`/lab-collector/active/${bookingId}/en-route/`)
      toast.success('Marked on the way.')
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'EN_ROUTE' } : b)))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status.')
    } finally {
      setBusyId(null)
    }
  }

  const markArrived = async (bookingId: string) => {
    setBusyId(bookingId)
    try {
      await api.post(`/lab-collector/active/${bookingId}/arrived/`)
      toast.success('Marked arrived.')
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'ARRIVED' } : b)))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status.')
    } finally {
      setBusyId(null)
    }
  }

  const markSubmittedToLab = async (bookingId: string) => {
    setBusyId(bookingId)
    try {
      await api.post(`/lab-collector/active/${bookingId}/submitted-to-lab/`)
      toast.success('Marked submitted to lab.')
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: 'SUBMITTED_TO_LAB' } : b)))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status.')
    } finally {
      setBusyId(null)
    }
  }

  const uploadReport = async (bookingId: string, file: File) => {
    setBusyId(bookingId)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.post(`/lab-collector/active/${bookingId}/upload-report/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Report uploaded — patient can now view it.')
      setBookings((prev) => prev.filter((b) => b.id !== bookingId))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload report.')
    } finally {
      setBusyId(null)
    }
  }

  const LOCATION_BANNER: Record<LocationStatus, { text: string; color: string } | null> = {
    idle: null,
    requesting: { text: 'Requesting location permission...', color: 'bg-surface-container text-on-surface-variant' },
    sharing: { text: 'Sharing your live location with the patient.', color: 'bg-emerald-50 text-emerald-700' },
    denied: { text: 'Location permission denied — the patient won\'t see your live position. Enable location access for this site to share it.', color: 'bg-error/10 text-error' },
    unsupported: { text: 'Live location isn\'t available on this device/browser.', color: 'bg-surface-container text-on-surface-variant' },
  }
  const banner = LOCATION_BANNER[locationStatus]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Active Collections</h1>
        <p className="text-sm text-on-surface-variant mt-1">Your current sample collections.</p>
      </div>

      {banner && (
        <div className={`rounded-xl px-4 py-2.5 text-xs font-medium ${banner.color}`}>{banner.text}</div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-56 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>task_alt</span>
          <p className="mt-2 text-sm">No active collections right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const isCod = b.payment_method === 'CASH_ON_DELIVERY'
            const busy = busyId === b.id
            return (
              <div key={b.id} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">{b.lab_test.name}</p>
                    <p className="text-sm font-bold text-on-surface mt-0.5">{b.user?.full_name || 'Patient'}</p>
                    {b.user?.phone && <a href={`tel:${b.user.phone}`} className="text-xs text-primary hover:underline">{b.user.phone}</a>}
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${isCod ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {isCod ? 'Collect Cash on Collection' : 'Already Paid Online'}
                  </span>
                </div>

                {b.address && (
                  <div className="border-t border-outline-variant pt-3">
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wide flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>flag</span>Address
                    </p>
                    <p className="text-sm text-on-surface mt-0.5">{b.address.address_line1}, {b.address.city}</p>
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>calendar_month</span>
                  {b.scheduled_date} · {b.time_slot}
                </div>

                {(() => {
                  const pill = STATUS_PILL[b.status] || { label: b.status.replace(/_/g, ' '), color: 'bg-surface-container text-on-surface-variant' }
                  return (
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${pill.color}`}>{pill.label}</span>
                      {b.status === 'CONFIRMED' ? (
                        <button onClick={() => markEnRoute(b.id)} disabled={busy}
                          className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                          On my way
                        </button>
                      ) : b.status === 'EN_ROUTE' ? (
                        <button onClick={() => markArrived(b.id)} disabled={busy}
                          className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                          Mark arrived
                        </button>
                      ) : b.status === 'ARRIVED' ? (
                        <ConfirmCollectedControl booking={b} busy={busy} onConfirm={confirmCollected} />
                      ) : b.status === 'SAMPLE_COLLECTED' ? (
                        <button onClick={() => markSubmittedToLab(b.id)} disabled={busy}
                          className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                          Submitted to lab
                        </button>
                      ) : b.status === 'SUBMITTED_TO_LAB' ? (
                        <UploadReportControl booking={b} busy={busy} onUpload={uploadReport} />
                      ) : null}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
