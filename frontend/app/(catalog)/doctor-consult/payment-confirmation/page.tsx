'use client'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import type { DoctorAppointment } from '@/types'

function AppointmentConfirmedContent() {
  const searchParams = useSearchParams()
  const [appt, setAppt] = useState<DoctorAppointment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const appointmentId = searchParams.get('appointmentId')
    if (!appointmentId) { setLoading(false); return }
    api.get('/doctors/appointments/').then((r) => {
      const found = (r.data.data.appointments || []).find((a: DoctorAppointment) => a.id === appointmentId)
      setAppt(found || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined ms-filled text-emerald-500" style={{ fontSize: '48px' }}>check_circle</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Appointment Confirmed!</h1>
        <p className="text-sm text-on-surface-variant mt-2">Payment received — your consultation is booked.</p>
      </div>
      {appt && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Doctor</span>
            <span className="font-medium text-on-surface">Dr. {appt.doctor.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Date</span>
            <span className="text-on-surface">{new Date(appt.scheduled_date).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Time</span>
            <span className="text-on-surface">{appt.time_slot}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Amount Paid</span>
            <span className="text-on-surface font-bold">NPR {Number(appt.fee_charged ?? appt.fee_amount).toFixed(0)}</span>
          </div>
        </div>
      )}
      <Link href="/appointments"
        className="inline-block w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
        View My Appointments
      </Link>
    </div>
  )
}

export default function AppointmentConfirmedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <AppointmentConfirmedContent />
    </Suspense>
  )
}
