'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DoctorAppointment } from '@/types'

type PickedMedicine = { medicine_id: string; name: string; brand_name: string; price: string; quantity: number }
type PickedLabTest = { lab_test_id: string; name: string; category_name: string; price: string }

export default function DoctorAppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [appt, setAppt] = useState<DoctorAppointment | null>(null)
  const [loading, setLoading] = useState(true)

  const [notes, setNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Medicine search-and-add — mirrors the admin prescription detail page's widget exactly,
  // just searching the public /medicines/ catalog instead of /admin/medicines/.
  const [medicineSearch, setMedicineSearch] = useState('')
  const [medicineResults, setMedicineResults] = useState<any[]>([])
  const [loadingMedicines, setLoadingMedicines] = useState(false)
  const [medicineQty, setMedicineQty] = useState<Record<string, string>>({})
  const [pickedMedicines, setPickedMedicines] = useState<PickedMedicine[]>([])

  // Lab test search-and-add — mirrors the customer-facing lab-tests browsing page's search.
  const [labSearch, setLabSearch] = useState('')
  const [labResults, setLabResults] = useState<any[]>([])
  const [loadingLabTests, setLoadingLabTests] = useState(false)
  const [pickedLabTests, setPickedLabTests] = useState<PickedLabTest[]>([])

  useEffect(() => {
    if (!id) return
    api.get('/doctor/appointments/').then((r) => {
      const found = (r.data.data.appointments || []).find((a: DoctorAppointment) => a.id === id)
      setAppt(found || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!medicineSearch.trim()) { setMedicineResults([]); return }
    setLoadingMedicines(true)
    const t = setTimeout(() => {
      api.get('/medicines/', { params: { search: medicineSearch, limit: 20 } })
        .then((r) => setMedicineResults(r.data.data.medicines || []))
        .catch(() => toast.error('Failed to search medicines.'))
        .finally(() => setLoadingMedicines(false))
    }, 300)
    return () => clearTimeout(t)
  }, [medicineSearch])

  useEffect(() => {
    if (!labSearch.trim()) { setLabResults([]); return }
    setLoadingLabTests(true)
    const t = setTimeout(() => {
      api.get('/lab-tests/', { params: { search: labSearch, limit: 20 } })
        .then((r) => setLabResults(r.data.data.labTests || []))
        .catch(() => toast.error('Failed to search lab tests.'))
        .finally(() => setLoadingLabTests(false))
    }, 300)
    return () => clearTimeout(t)
  }, [labSearch])

  const addMedicine = (m: any) => {
    if (pickedMedicines.some((p) => p.medicine_id === m.id)) { toast.error('Already added.'); return }
    const qty = Number(medicineQty[m.id] ?? '1')
    if (!Number.isFinite(qty) || qty < 1) { toast.error('Enter a valid quantity.'); return }
    setPickedMedicines((prev) => [...prev, { medicine_id: m.id, name: m.name, brand_name: m.brand_name, price: m.price, quantity: qty }])
  }
  const removeMedicine = (medicineId: string) => setPickedMedicines((prev) => prev.filter((p) => p.medicine_id !== medicineId))

  const addLabTest = (t: any) => {
    if (pickedLabTests.some((p) => p.lab_test_id === t.id)) { toast.error('Already added.'); return }
    setPickedLabTests((prev) => [...prev, { lab_test_id: t.id, name: t.name, category_name: t.category_name, price: t.price }])
  }
  const removeLabTest = (labTestId: string) => setPickedLabTests((prev) => prev.filter((p) => p.lab_test_id !== labTestId))

  const handleComplete = async () => {
    if (!notes.trim()) { toast.error('Consultation notes are required.'); return }
    setSubmitting(true)
    try {
      const res = await api.post(`/doctor/appointments/${id}/complete/`, {
        notes: notes.trim(),
        medicine_items: pickedMedicines.map((p) => ({ medicine_id: p.medicine_id, quantity: p.quantity })),
        lab_test_items: pickedLabTests.map((p) => p.lab_test_id),
        follow_up_date: followUpDate || undefined,
        follow_up_notes: followUpNotes.trim() || undefined,
      })
      toast.success(res.data.message || 'Appointment marked complete.')
      router.push('/doctor/appointments')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to complete appointment.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!appt) {
    return (
      <div className="text-center py-24">
        <p className="text-base text-on-surface">Appointment not found.</p>
        <Link href="/doctor/appointments" className="text-sm text-primary hover:underline mt-2 block">Back to Appointments</Link>
      </div>
    )
  }

  const canComplete = appt.status === 'CONFIRMED' && !!appt.meeting_link

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/doctor/appointments" className="hover:text-primary transition-colors">Appointments</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{appt.user?.full_name || 'Patient'}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-on-surface">{appt.user?.full_name || 'Patient'}</p>
            <p className="text-xs text-on-surface-variant">{appt.user?.email}{appt.user?.phone ? ` · ${appt.user.phone}` : ''}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{new Date(appt.scheduled_date).toLocaleDateString()} · {appt.time_slot}</p>
            {appt.reason && <p className="text-xs text-on-surface-variant mt-0.5 italic">"{appt.reason}"</p>}
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary/10 text-secondary whitespace-nowrap">{appt.status}</span>
        </div>
      </div>

      {!canComplete ? (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5">
          <p className="text-sm text-on-surface-variant">
            {appt.status === 'COMPLETED'
              ? 'This consultation has already been completed.'
              : appt.status === 'CONFIRMED'
              ? 'Set a meeting link before you can complete this consultation.'
              : `Can only complete a confirmed appointment (current status: ${appt.status}).`}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <label className="text-sm font-bold text-on-surface" htmlFor="consult-notes">Consultation Notes *</label>
            <textarea id="consult-notes" required rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Diagnosis, advice given, follow-up instructions..."
              className="w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition resize-none" />
            <p className="text-xs text-on-surface-variant">Required to complete the consultation — this becomes a real prescription record the patient can always find.</p>
          </div>

          {/* Medicines */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <p className="text-sm font-bold text-on-surface">Prescribe Medicines (optional)</p>
            <input type="text" value={medicineSearch} onChange={(e) => setMedicineSearch(e.target.value)}
              placeholder="Search medicines by name or brand..."
              className="w-full max-w-md px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />

            {medicineSearch.trim() && (
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <div className="divide-y divide-outline-variant max-h-64 overflow-y-auto">
                  {loadingMedicines ? (
                    [...Array(3)].map((_, i) => <div key={i} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></div>)
                  ) : medicineResults.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-on-surface-variant">No medicines found.</div>
                  ) : medicineResults.map((m) => (
                    <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                        <p className="text-xs text-on-surface-variant">{m.brand_name} · NPR {Number(m.price).toFixed(0)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input type="number" min={1} value={medicineQty[m.id] ?? '1'}
                          onChange={(e) => setMedicineQty((p) => ({ ...p, [m.id]: e.target.value }))}
                          className="w-16 px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                        <button type="button" onClick={() => addMedicine(m)}
                          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity">
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pickedMedicines.length > 0 && (
              <div className="divide-y divide-outline-variant border-t border-outline-variant pt-2">
                {pickedMedicines.map((p) => (
                  <div key={p.medicine_id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{p.name}</p>
                      <p className="text-xs text-on-surface-variant">Qty {p.quantity} · NPR {Number(p.price).toFixed(0)} each</p>
                    </div>
                    <button type="button" onClick={() => removeMedicine(p.medicine_id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-error hover:bg-error-container transition-colors flex-shrink-0">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lab tests */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <p className="text-sm font-bold text-on-surface">Suggest Lab Tests (optional)</p>
            <div className="relative max-w-md">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
              <input type="text" value={labSearch} onChange={(e) => setLabSearch(e.target.value)}
                placeholder="Search lab tests..."
                className="w-full pl-9 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>

            {labSearch.trim() && (
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <div className="divide-y divide-outline-variant max-h-64 overflow-y-auto">
                  {loadingLabTests ? (
                    [...Array(3)].map((_, i) => <div key={i} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></div>)
                  ) : labResults.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-on-surface-variant">No lab tests found.</div>
                  ) : labResults.map((t) => (
                    <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{t.name}</p>
                        <p className="text-xs text-on-surface-variant">{t.category_name} · NPR {Number(t.price).toFixed(0)}</p>
                      </div>
                      <button type="button" onClick={() => addLabTest(t)}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity flex-shrink-0">
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pickedLabTests.length > 0 && (
              <div className="divide-y divide-outline-variant border-t border-outline-variant pt-2">
                {pickedLabTests.map((p) => (
                  <div key={p.lab_test_id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{p.name}</p>
                      <p className="text-xs text-on-surface-variant">{p.category_name} · NPR {Number(p.price).toFixed(0)}</p>
                    </div>
                    <button type="button" onClick={() => removeLabTest(p.lab_test_id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-error hover:bg-error-container transition-colors flex-shrink-0">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Follow-up */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            <p className="text-sm font-bold text-on-surface">Schedule a Follow-Up (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-on-surface-variant" htmlFor="follow-up-date">Follow-up Date</label>
                <input id="follow-up-date" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant" htmlFor="follow-up-notes">Follow-up Notes</label>
                <input id="follow-up-notes" type="text" value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)}
                  placeholder="e.g., recheck blood pressure"
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            </div>
            <p className="text-xs text-on-surface-variant">The patient will get a reminder around this date. Leave blank if no follow-up is needed.</p>
          </div>

          <button onClick={handleComplete} disabled={submitting}
            className="w-full py-3 bg-emerald-600 text-white text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Completing...</> : 'Complete Consultation'}
          </button>
        </>
      )}
    </div>
  )
}
