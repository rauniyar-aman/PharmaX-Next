'use client'
import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { LabTest, Address } from '@/types'

const TIME_SLOTS = ['6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '4:00 PM - 6:00 PM', '6:00 PM - 8:00 PM']

// Mirrors (customer)/checkout/payment/page.tsx's METHODS list — same three gateways, same
// pay-now-vs-pay-on-collection choice, just worded for a sample collection instead of a delivery.
const PAYMENT_METHODS = [
  { id: 'CASH_ON_DELIVERY', label: 'Pay on Collection', icon: 'payments', desc: 'Pay the collector in cash when they arrive' },
  { id: 'ESEWA', label: 'eSewa', icon: 'account_balance_wallet', desc: 'Pay now via eSewa digital wallet' },
  { id: 'KHALTI', label: 'Khalti', icon: 'account_balance_wallet', desc: 'Pay now via Khalti digital wallet' },
]

function tomorrowDateStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function LabTestDetailContent() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Set when arriving from a doctor's suggested-test review screen — pre-selects nothing visually
  // (the test itself IS the page), just carries through so the resulting booking links back to
  // the suggestion it fulfills. Never fails the booking if it doesn't resolve to anything.
  const prescriptionLabTestItemId = searchParams.get('prescription_lab_test_item_id')
  const user = useAuthStore((s) => s.user)

  const [test, setTest] = useState<LabTest | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [addressId, setAddressId] = useState('')
  const [date, setDate] = useState(tomorrowDateStr())
  const [timeSlot, setTimeSlot] = useState('')
  const [notes, setNotes] = useState('')
  const [method, setMethod] = useState('CASH_ON_DELIVERY')
  const [booking, setBooking] = useState(false)

  useEffect(() => {
    if (!id) return
    api.get(`/lab-tests/${id}/`).then((r) => setTest(r.data.data.labTest)).catch(() => toast.error('Lab test not found.')).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!user) return
    api.get('/addresses/').then((r) => {
      const addrs = r.data.data.addresses || []
      setAddresses(addrs)
      const def = addrs.find((a: Address) => a.is_default) || addrs[0]
      if (def) setAddressId(def.id)
    }).catch(() => {})
  }, [user])

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

  const handleBook = async () => {
    if (!user) { router.push('/signin'); return }
    if (!addressId) { toast.error('Please select a sample collection address.'); return }
    if (!timeSlot) { toast.error('Please select a time slot.'); return }
    setBooking(true)
    try {
      const res = await api.post('/lab-tests/bookings/', {
        lab_test_id: id, address_id: addressId, scheduled_date: date, time_slot: timeSlot, notes: notes || undefined,
        prescription_lab_test_item_id: prescriptionLabTestItemId || undefined,
        payment_method: method,
      })
      const bookingId = res.data.data.booking.id

      // Booking creation itself never depends on the payment path (mirrors checkout) — COD is
      // already confirmed by the time this response comes back. KHALTI/ESEWA leave the booking
      // PENDING until the gateway round trip actually confirms payment, so immediately kick that
      // off using the booking id we just got back.
      if (method === 'ESEWA') {
        const payRes = await api.post('/payment/esewa/initiate-lab-test/', { booking_id: bookingId })
        submitEsewaForm(payRes.data.data.formUrl, payRes.data.data.params)
        return
      }
      if (method === 'KHALTI') {
        const payRes = await api.post('/payment/khalti/initiate-lab-test/', { booking_id: bookingId })
        window.location.href = payRes.data.data.payment_url
        return
      }

      toast.success('Lab test booked!')
      router.push('/lab-test-bookings')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not book this test.')
    } finally {
      setBooking(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!test) return (
    <div className="text-center py-24">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '56px' }}>biotech</span>
      <p className="text-base font-medium text-on-surface mt-3">Lab test not found</p>
      <Link href="/lab-tests" className="inline-block mt-4 text-sm text-primary hover:underline">Back to Lab Tests</Link>
    </div>
  )

  const discount = Number(test.original_price) > Number(test.price)
    ? Math.round(((Number(test.original_price) - Number(test.price)) / Number(test.original_price)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/lab-tests" className="hover:text-primary transition-colors">Lab Tests</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{test.name}</span>
      </div>

      {prescriptionLabTestItemId && (
        <div className="flex items-center gap-2.5 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-2.5">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>stethoscope</span>
          <p className="text-sm text-on-surface">Suggested by your doctor — booking it here will mark that suggestion as actioned.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-surface rounded-2xl border border-outline-variant p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">{test.category?.name}</span>
              {test.is_package && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-50 text-purple-600">Package</span>}
            </div>
            <h1 className="text-2xl font-bold text-on-surface leading-tight">{test.name}</h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>science</span>{test.sample_type} sample</span>
              {test.reporting_time && <span className="flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>schedule</span>Report in {test.reporting_time}</span>}
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{test.fasting_required ? 'no_food' : 'check_circle'}</span>
                {test.fasting_required ? 'Fasting required' : 'No fasting required'}
              </span>
            </div>

            {test.description && (
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-1">About this test</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{test.description}</p>
              </div>
            )}
            {test.parameters_included && (
              <div>
                <h3 className="text-sm font-bold text-on-surface mb-1">Parameters Included</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{test.parameters_included}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4 sticky top-[7.5rem]">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-on-surface">NPR {Number(test.price).toFixed(0)}</span>
              {discount > 0 && (
                <>
                  <span className="text-sm text-on-surface-variant line-through">NPR {Number(test.original_price).toFixed(0)}</span>
                  <span className="text-xs font-bold text-error">{discount}% OFF</span>
                </>
              )}
            </div>

            {user ? (
              <>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Sample Collection Address</label>
                  {addresses.length === 0 ? (
                    <Link href="/addresses" className="mt-1 block text-sm text-primary hover:underline">+ Add an address to book</Link>
                  ) : (
                    <select value={addressId} onChange={(e) => setAddressId(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                      {addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.address_line1}, {a.city}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Preferred Date</label>
                  <input type="date" min={tomorrowDateStr()} value={date} onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Time Slot</label>
                  <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                    <option value="">Select a time slot</option>
                    {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Notes (optional)</label>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Payment Method</label>
                  <div className="mt-1.5 space-y-1.5">
                    {PAYMENT_METHODS.map((m) => (
                      <label key={m.id} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${method === m.id ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/40'}`}>
                        <input type="radio" name="payment" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-primary" />
                        <span className="material-symbols-outlined ms-filled text-on-surface-variant" style={{ fontSize: '18px' }}>{m.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-on-surface">{m.label}</p>
                          <p className="text-[11px] text-on-surface-variant">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <button onClick={handleBook} disabled={booking || addresses.length === 0}
                  className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {booking
                    ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />{method === 'ESEWA' ? 'Redirecting to eSewa...' : method === 'KHALTI' ? 'Redirecting to Khalti...' : 'Booking...'}</>
                    : method === 'ESEWA' ? 'Book & Pay with eSewa' : method === 'KHALTI' ? 'Book & Pay with Khalti' : 'Book This Test'}
                </button>
              </>
            ) : (
              <button onClick={() => router.push('/signin')}
                className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
                Sign In to Book
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LabTestDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <LabTestDetailContent />
    </Suspense>
  )
}
