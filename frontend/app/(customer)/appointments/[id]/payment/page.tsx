'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorAppointment } from '@/types'

// Mirrors (customer)/checkout/payment/page.tsx's mechanic — POST to initiate, then redirect the
// browser to the gateway's payment_url. Everything order-specific there (coupon, wallet, delivery
// charge, method choice) doesn't apply here: a consultation only supports Khalti (Stage 2), has no
// cart, and no delivery charge — so this is a deliberately smaller page, not a stripped-down copy.
export default function AppointmentPaymentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [appt, setAppt] = useState<DoctorAppointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!id) return
    api.get('/doctors/appointments/').then((r) => {
      const found = (r.data.data.appointments || []).find((a: DoctorAppointment) => a.id === id)
      setAppt(found || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const handlePay = async () => {
    setPaying(true)
    try {
      const res = await api.post('/payment/khalti/initiate-appointment/', { appointment_id: id })
      window.location.href = res.data.data.payment_url
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start payment.')
      setPaying(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!appt) {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 mx-auto rounded-full bg-error/10 flex items-center justify-center">
          <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '32px' }}>error</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Appointment Not Found</h1>
          <p className="text-sm text-on-surface-variant mt-2">This appointment doesn't exist or isn't yours.</p>
        </div>
        <Link href="/appointments" className="inline-block w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          Back to Appointments
        </Link>
      </div>
    )
  }

  if (appt.payment_status !== 'PENDING') {
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-12">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
          <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '32px' }}>check_circle</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Nothing to Pay</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            {appt.payment_status === 'PAID' ? 'This appointment is already paid for.' : 'This appointment doesn\'t require payment.'}
          </p>
        </div>
        <Link href="/appointments" className="inline-block w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
          View My Appointments
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">Complete Payment</h1>
      <p className="text-sm text-on-surface-variant -mt-3">Pay the consultation fee to confirm your appointment with Dr. {appt.doctor.name}.</p>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2 text-sm">
        <div className="flex justify-between text-on-surface-variant"><span>Doctor</span><span className="text-on-surface font-medium">Dr. {appt.doctor.name}</span></div>
        <div className="flex justify-between text-on-surface-variant"><span>Date</span><span className="text-on-surface">{new Date(appt.scheduled_date).toLocaleDateString()}</span></div>
        <div className="flex justify-between text-on-surface-variant"><span>Time</span><span className="text-on-surface">{appt.time_slot}</span></div>
        <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-2">
          <span>Amount Due</span><span>NPR {Number(appt.fee_charged ?? appt.fee_amount).toFixed(0)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 rounded-2xl border border-primary bg-primary/5">
        <span className="material-symbols-outlined ms-filled text-on-surface-variant" style={{ fontSize: '22px' }}>account_balance_wallet</span>
        <div>
          <p className="text-sm font-semibold text-on-surface">Khalti</p>
          <p className="text-xs text-on-surface-variant">Pay via Khalti digital wallet</p>
        </div>
      </div>

      <button onClick={handlePay} disabled={paying}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
        {paying ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Redirecting to Khalti...</> : 'Pay with Khalti'}
      </button>
      <p className="text-[11px] text-on-surface-variant text-center">
        If payment isn't completed, this appointment's slot will be released and you'll need to book again.
      </p>
    </div>
  )
}
