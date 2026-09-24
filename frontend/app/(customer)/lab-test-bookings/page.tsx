'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { LabTestBooking, LabReportShare, LabReportShareOptions } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  EN_ROUTE: 'bg-indigo-50 text-indigo-600',
  ARRIVED: 'bg-blue-50 text-blue-600',
  SAMPLE_COLLECTED: 'bg-primary/10 text-primary',
  SUBMITTED_TO_LAB: 'bg-purple-50 text-purple-600',
  REPORT_READY: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

const STATUS_ICONS: Record<string, string> = {
  PENDING: 'hourglass_empty',
  CONFIRMED: 'check_circle',
  EN_ROUTE: 'directions_car',
  ARRIVED: 'pin_drop',
  SAMPLE_COLLECTED: 'vaccines',
  SUBMITTED_TO_LAB: 'biotech',
  REPORT_READY: 'description',
  CANCELLED: 'cancel',
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  KHALTI: 'Khalti',
  ESEWA: 'eSewa',
  CASH_ON_DELIVERY: 'Cash on Collection',
}

/**
 * Hands a finished report to a doctor — and takes it back.
 *
 * A doctor never sees a report just because they ordered it; this control is the only way one
 * reaches them. So the ordering doctor gets a named one-tap button (that's the case that happens
 * most, and having to hunt for their name in a list would be silly), and every other doctor the
 * patient has consulted is one tap further, behind "Send to another doctor". The full list costs a
 * request, so it's only fetched when asked for.
 */
function ShareReportControl({ booking, onShares }: { booking: LabTestBooking; onShares: (shares: LabReportShare[]) => void }) {
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<LabReportShareOptions | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const url = `/lab-tests/bookings/${booking.id}/share-report/`
  const shares = booking.shared_with || []
  const ordering = booking.ordered_by_doctor
  const orderingHasIt = !!ordering && shares.some((s) => s.doctor_id === ordering.id)

  const openPicker = async () => {
    setPicking(true)
    if (options) return
    setLoadingOptions(true)
    try {
      const res = await api.get(url)
      setOptions(res.data.data)
    } catch {
      toast.error('Could not load your doctors.')
      setPicking(false)
    } finally {
      setLoadingOptions(false)
    }
  }

  const send = async (doctorId: string) => {
    setBusyId(doctorId)
    try {
      const res = await api.post(url, { doctor_id: doctorId })
      onShares(res.data.data.shares)
      toast.success(res.data.message)
      setPicking(false)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not send the report.')
    } finally {
      setBusyId(null)
    }
  }

  const revoke = async (doctorId: string, doctorName: string) => {
    if (!confirm(`Remove Dr. ${doctorName}'s access to this report?`)) return
    setBusyId(doctorId)
    try {
      const res = await api.delete(`${url}?doctor_id=${doctorId}`)
      onShares(res.data.data.shares)
      toast.success('Access removed.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not remove access.')
    } finally {
      setBusyId(null)
    }
  }

  // Already-sent doctors are hidden from the picker: the way to undo is the chip above, so listing
  // them again with a disabled row would only add noise.
  const sendable = (options?.doctors || []).filter((d) => !shares.some((s) => s.doctor_id === d.id))

  return (
    <div className="border-t border-outline-variant pt-3 space-y-2">
      {shares.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {shares.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>send</span>
              Sent to Dr. {s.doctor_name}
              <button onClick={() => revoke(s.doctor_id, s.doctor_name)} disabled={busyId === s.doctor_id}
                title="Remove access" aria-label={`Remove Dr. ${s.doctor_name}'s access`}
                className="ml-0.5 p-0.5 rounded-full hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                <span className="material-symbols-outlined block" style={{ fontSize: '14px' }}>close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {!picking ? (
        <div className="flex items-center gap-4 flex-wrap">
          {ordering?.has_login && !orderingHasIt && (
            <button onClick={() => send(ordering.id)} disabled={busyId === ordering.id}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>stethoscope</span>
              {busyId === ordering.id ? 'Sending...' : `Send to Dr. ${ordering.name}`}
            </button>
          )}
          <button onClick={openPicker} className="text-xs font-semibold text-primary hover:underline">
            {shares.length || (ordering?.has_login && !orderingHasIt) ? 'Send to another doctor' : 'Send this report to a doctor'}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-container-low p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-on-surface">Send this report to</p>
            <button onClick={() => setPicking(false)} className="text-xs text-on-surface-variant hover:text-on-surface">Cancel</button>
          </div>
          {loadingOptions ? (
            <p className="text-xs text-on-surface-variant py-1">Loading your doctors...</p>
          ) : sendable.length === 0 ? (
            <p className="text-xs text-on-surface-variant py-1">
              {options?.doctors.length
                ? 'Every doctor you have consulted already has this report.'
                : 'You have not consulted a doctor yet. Book a consultation and you can send this report to them afterwards.'}
            </p>
          ) : (
            sendable.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-1">
                <div className="min-w-0">
                  <p className="text-sm text-on-surface truncate">Dr. {d.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {d.specialty}{d.ordered_this_test ? ' · ordered this test' : ''}
                  </p>
                </div>
                <button onClick={() => send(d.id)} disabled={busyId === d.id}
                  className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap">
                  {busyId === d.id ? 'Sending...' : 'Send'}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function LabTestBookingsPage() {
  const [bookings, setBookings] = useState<LabTestBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)

  const load = () => {
    api.get('/lab-tests/bookings/').then((r) => setBookings(r.data.data.bookings || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Sharing changes one booking's `shared_with` and nothing else, so it's patched in place rather
  // than refetching the whole list and collapsing any picker the patient has open.
  const applyShares = (bookingId: string, shares: LabReportShare[]) => {
    setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, shared_with: shares } : b)))
  }

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

  const submitEsewaForm = (formUrl: string, params: Record<string, string>) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = formUrl
    Object.entries(params).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  // Retry path for a booking left PENDING because the gateway round trip was abandoned last time
  // — mirrors the initiate call the booking form itself makes, just re-triggered from here with
  // the booking id that already exists instead of creating a new booking.
  const completePayment = async (b: LabTestBooking) => {
    setPayingId(b.id)
    try {
      if (b.payment_method === 'ESEWA') {
        const res = await api.post('/payment/esewa/initiate-lab-test/', { booking_id: b.id })
        submitEsewaForm(res.data.data.formUrl, res.data.data.params)
        return
      }
      if (b.payment_method === 'KHALTI') {
        const res = await api.post('/payment/khalti/initiate-lab-test/', { booking_id: b.id })
        window.location.href = res.data.data.payment_url
        return
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start payment.')
    } finally {
      setPayingId(null)
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
                {b.patient_name && (
                  <p className="text-xs font-medium text-secondary mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>person</span>
                    For {b.patient_name}{b.patient_age ? `, ${b.patient_age}` : ''}{b.patient_gender ? `, ${b.patient_gender.charAt(0)}${b.patient_gender.slice(1).toLowerCase()}` : ''}
                  </p>
                )}
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
              <div>
                <p className="text-on-surface-variant">Payment</p>
                <p className={`font-medium mt-0.5 ${b.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {b.payment_status === 'PAID' ? 'Paid' : 'Pending'}
                  {b.payment_method && <span className="text-on-surface-variant font-normal"> · {PAYMENT_METHOD_LABEL[b.payment_method] || b.payment_method}</span>}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant">Collector</p>
                <p className="font-medium text-on-surface mt-0.5 truncate">{b.collector?.full_name || 'Not yet assigned'}</p>
                {b.collector?.phone && (
                  <a href={`tel:${b.collector.phone}`} className="text-xs text-primary hover:underline">{b.collector.phone}</a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {/* Only while they're actually coming to you. Before CONFIRMED nobody is assigned;
                  from SAMPLE_COLLECTED on they've left, and the tracking endpoint stops returning
                  coordinates — so the link would lead to a map with nothing on it. */}
              {b.collector && (b.status === 'CONFIRMED' || b.status === 'EN_ROUTE' || b.status === 'ARRIVED') && (
                <Link href={`/lab-test-bookings/${b.id}/track`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>my_location</span>
                  Track Collector
                </Link>
              )}
              {b.report_file_url ? (
                <a href={resolveImg(b.report_file_url) || '#'} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  View Report
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                </a>
              ) : b.status === 'REPORT_READY' && b.report_url && (
                <a href={b.report_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  View Report
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                </a>
              )}
              {b.payment_status === 'PENDING' && (b.payment_method === 'KHALTI' || b.payment_method === 'ESEWA') && b.status !== 'CANCELLED' && (
                <button onClick={() => completePayment(b)} disabled={payingId === b.id}
                  className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">
                  {payingId === b.id ? 'Redirecting...' : 'Complete Payment'}
                </button>
              )}
              {(b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'EN_ROUTE' || b.status === 'ARRIVED') && (
                <button onClick={() => handleCancel(b.id)} disabled={cancelling === b.id}
                  className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                  {cancelling === b.id ? 'Cancelling...' : 'Cancel Booking'}
                </button>
              )}
            </div>
            {/* The report is the patient's to give away — a doctor, including the one who ordered
                the test, sees it only once it's sent from here. */}
            {b.report_file_url && <ShareReportControl booking={b} onShares={(shares) => applyShares(b.id, shares)} />}
          </div>
        ))}
      </div>
    </div>
  )
}
