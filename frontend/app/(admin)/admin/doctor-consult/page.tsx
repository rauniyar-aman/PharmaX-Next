'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { downloadFile } from '@/lib/downloadFile'
import type { Doctor, DoctorAppointment, AppointmentStatus } from '@/types'

const TABS = ['Doctors', 'Appointments'] as const
type Tab = typeof TABS[number]

const APPT_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  COMPLETED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

export default function AdminDoctorConsultPage() {
  const [tab, setTab] = useState<Tab>('Doctors')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-outline-variant">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Doctors' ? <DoctorsTab /> : <AppointmentsTab />}
    </div>
  )
}

function DoctorsTab() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/doctors/').then((r) => setDoctors(r.data.data.doctors || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this doctor?')) return
    setDeleting(id)
    try {
      await api.delete(`/admin/doctors/${id}/`)
      toast.success('Doctor removed.')
      setDoctors((p) => p.filter((d) => d.id !== id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{doctors.length} doctors</p>
        <Link href="/admin/doctor-consult/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Doctor
        </Link>
      </div>
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Specialty', 'Experience', 'Fee', 'Consultations', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : doctors.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No doctors yet</td></tr>
              ) : doctors.map((d) => (
                <tr key={d.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">
                    <Link href={`/admin/doctor-consult/${d.id}`} className="hover:text-primary hover:underline">Dr. {d.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.specialty}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.experience_years} yrs</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(d.consultation_fee).toFixed(0)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.total_consultations}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 transition-colors text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AppointmentsTab() {
  const [appts, setAppts] = useState<DoctorAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})

  const fetchAppts = useCallback(() => {
    setLoading(true)
    const params: any = {}
    if (statusFilter !== 'ALL') params.status = statusFilter
    api.get('/admin/appointments/', { params }).then((r) => setAppts(r.data.data.appointments || [])).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter])
  useEffect(() => { fetchAppts() }, [fetchAppts])

  // Filtered here rather than server-side: the list arrives whole already, and "who did Dr. X see"
  // is the question admin asks most, so it should answer as you type.
  const q = query.trim().toLowerCase()
  const visible = q
    ? appts.filter((a) => [a.doctor?.name, a.doctor?.specialty, a.user?.full_name, a.user?.email, a.user?.phone]
        .some((f) => (f || '').toLowerCase().includes(q)))
    : appts

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id)
    try {
      await api.put(`/admin/appointments/${id}/`, { status: newStatus })
      toast.success('Appointment updated.')
      fetchAppts()
    } catch {
      toast.error('Failed to update.')
    } finally {
      setUpdating(null)
    }
  }

  const saveLink = async (id: string) => {
    setUpdating(id)
    try {
      await api.put(`/admin/appointments/${id}/`, { meeting_link: linkDrafts[id] || '' })
      toast.success('Meeting link saved.')
      fetchAppts()
    } catch {
      toast.error('Failed to save link.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input type="text" placeholder="Search by doctor or patient..." value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['ALL', ...APPT_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-24 animate-pulse" />)
        ) : visible.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant text-on-surface-variant">
            {q ? `No appointments match “${query.trim()}”` : 'No appointments found'}
          </div>
        ) : visible.map((a) => (
          <div key={a.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">Dr. {a.doctor?.name} ({a.doctor?.specialty})</p>
                <p className="text-xs text-on-surface-variant">{a.user?.full_name} · {a.user?.email}</p>
                <p className="text-xs text-on-surface-variant">{new Date(a.scheduled_date).toLocaleDateString()} · {a.time_slot}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[a.status] || 'bg-surface-container text-on-surface-variant'}`}>{a.status}</span>
                <select value={a.status} onChange={(e) => updateStatus(a.id, e.target.value)} disabled={updating === a.id}
                  className="text-xs border border-outline-variant rounded-lg px-2 py-1.5 bg-surface text-on-surface focus:outline-none focus:border-secondary transition disabled:opacity-60">
                  {APPT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Meeting link (e.g., video call URL)"
                defaultValue={a.meeting_link || ''}
                onChange={(e) => setLinkDrafts((p) => ({ ...p, [a.id]: e.target.value }))}
                className="flex-1 px-3 py-2 border border-outline-variant rounded-xl bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
              <button onClick={() => saveLink(a.id)} disabled={updating === a.id}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50">Save Link</button>
            </div>
            <ConsultationRecord appt={a} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** What the doctor wrote up after the consultation: notes, what was prescribed, what was suggested
 *  but never booked, and when the patient is due back. Read-only — admin support answers questions
 *  with it; only the doctor writes it. */
function ConsultationRecord({ appt }: { appt: DoctorAppointment }) {
  const presc = appt.prescription
  const medicines = presc?.medicines || []
  const labTests = presc?.lab_tests || []

  // A completed consultation with nothing written up is itself worth surfacing — it is the one case
  // where admin has to go and ask the doctor.
  if (!presc && !appt.follow_up_date) {
    if (appt.status !== 'COMPLETED') return null
    return (
      <p className="pt-3 border-t border-outline-variant text-xs text-amber-600">
        Completed with no consultation record — the doctor has not written this up.
      </p>
    )
  }

  return (
    <div className="pt-3 border-t border-outline-variant space-y-2.5 text-xs">
      {presc?.notes && (
        <RecordRow label="Consultation notes">
          <p className="whitespace-pre-wrap text-on-surface">{presc.notes}</p>
        </RecordRow>
      )}
      {medicines.length > 0 && (
        <RecordRow label={`Medicines (${medicines.length})`}>
          {medicines.map((m) => (
            <p key={m.id} className="text-on-surface">{m.name} <span className="text-on-surface-variant">×{m.quantity}</span></p>
          ))}
        </RecordRow>
      )}
      {labTests.length > 0 && (
        <RecordRow label={`Tests suggested (${labTests.length})`}>
          {labTests.map((t) => (
            <p key={t.id} className="text-on-surface">
              {t.name}{' '}
              {t.booking_status
                ? <span className="text-on-surface-variant">— booked, {t.booking_status.toLowerCase().replace(/_/g, ' ')}</span>
                : <span className="text-amber-600">— not booked yet</span>}
            </p>
          ))}
        </RecordRow>
      )}
      {presc && !presc.notes && medicines.length === 0 && labTests.length === 0 && (
        <RecordRow label="Consultation record">
          <p className="text-on-surface-variant">Opened, but nothing prescribed or suggested.</p>
        </RecordRow>
      )}
      {appt.follow_up_date && (
        <RecordRow label="Follow-up">
          <p className="text-on-surface">{new Date(appt.follow_up_date).toLocaleDateString()}</p>
          {appt.follow_up_notes && <p className="whitespace-pre-wrap text-on-surface-variant">{appt.follow_up_notes}</p>}
        </RecordRow>
      )}
      {presc?.file_url && (
        <RecordRow label="Prescription PDF">
          <button onClick={() => downloadFile(presc.file_url!, `prescription-${presc.id}.pdf`).catch(() => toast.error('Download failed.'))}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>download</span>Download
          </button>
        </RecordRow>
      )}
    </div>
  )
}

function RecordRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="sm:w-40 shrink-0 font-medium text-on-surface-variant">{label}</span>
      <div className="flex-1 min-w-0 space-y-0.5">{children}</div>
    </div>
  )
}
