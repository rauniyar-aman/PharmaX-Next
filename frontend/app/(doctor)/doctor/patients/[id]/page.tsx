'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorPatientDetail, AppointmentStatus } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DoctorPatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<DoctorPatientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    api.get(`/doctor/patients/${id}/`)
      .then((r) => setDetail(r.data.data))
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true)
        else toast.error('Failed to load patient history.')
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (notFound || !detail) {
    return (
      <div className="text-center py-24">
        <p className="text-base text-on-surface">Patient not found.</p>
        <Link href="/doctor/patients" className="text-sm text-primary hover:underline mt-2 block">Back to Patients</Link>
      </div>
    )
  }

  const { patient, appointments, prescriptions } = detail

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/doctor/patients" className="hover:text-primary transition-colors">Patients</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{patient.full_name}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <p className="text-lg font-bold text-on-surface">{patient.full_name}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{patient.email}{patient.phone ? ` · ${patient.phone}` : ''}</p>
        <p className="text-xs text-on-surface-variant mt-1">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''} with you</p>
      </div>

      {/* Appointment history */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-on-surface">Appointment History</p>
        {appointments.map((a) => (
          <div key={a.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-on-surface">{fmtDate(a.scheduled_date)} · {a.time_slot}</p>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[a.status as AppointmentStatus]}`}>{a.status}</span>
            </div>
            {a.reason && <p className="text-xs text-on-surface-variant italic">"{a.reason}"</p>}
            {a.prescription?.notes && (
              <p className="text-sm text-on-surface bg-surface-container-low rounded-xl p-3">{a.prescription.notes}</p>
            )}
            {a.follow_up_date && (
              <p className="text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>event_repeat</span>
                Follow-up recommended for {fmtDate(a.follow_up_date)}{a.follow_up_notes ? ` — ${a.follow_up_notes}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Prescriptions issued */}
      {prescriptions.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-on-surface">Prescriptions Issued</p>
          {prescriptions.map((presc) => (
            <div key={presc.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
              <p className="text-xs text-on-surface-variant">{fmtDate(presc.uploaded_at)}</p>
              {presc.notes && <p className="text-sm text-on-surface">{presc.notes}</p>}

              {presc.medicine_items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Medicines</p>
                  {presc.medicine_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="text-on-surface">{item.medicine.name}</span>
                      <span className="text-on-surface-variant">Qty {item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Same booked/unbooked visual treatment as the patient's own review screen — but no
                  action here, since booking is the patient's action, not the doctor's. */}
              {presc.lab_test_items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Suggested Lab Tests</p>
                  {presc.lab_test_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-on-surface">{item.lab_test.name}</span>
                      {item.booking_id ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">
                          <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>check_circle</span>
                          Booked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">
                          <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>hourglass_top</span>
                          Not yet booked
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
