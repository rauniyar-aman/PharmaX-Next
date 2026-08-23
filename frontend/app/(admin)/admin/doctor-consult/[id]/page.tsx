'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Doctor, DoctorPayout } from '@/types'

function fmt(n: string | number) {
  return `NPR ${Number(n).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })
}

function LinkAccountForm({ doctorId, onLinked }: { doctorId: string; onLinked: (doctor: Doctor) => void }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.post(`/admin/doctors/${doctorId}/link-account/`, form)
      toast.success('Login account linked.')
      onLinked(res.data.data.doctor)
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to link account.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-2xl border border-amber-200 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-500" style={{ fontSize: '24px' }}>person_off</span>
        <div>
          <p className="text-sm font-bold text-on-surface">No Login Account Linked</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            This doctor predates login accounts and can't sign in yet. Create one below to unlock everything else on this page.
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Full Name</label>
            <input type="text" required value={form.full_name} onChange={(e) => set('full_name', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Email</label>
            <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Phone</label>
            <input type="text" required value={form.phone} onChange={(e) => set('phone', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
        </div>
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? 'Linking...' : 'Link Account'}
        </button>
      </form>
    </div>
  )
}

export default function AdminDoctorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [payouts, setPayouts] = useState<DoctorPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [payoutsLoading, setPayoutsLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [markingPayoutId, setMarkingPayoutId] = useState<string | null>(null)
  const [markingOnboarding, setMarkingOnboarding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const loadDoctor = useCallback(() => {
    api.get(`/admin/doctors/${id}/`).then((r) => setDoctor(r.data.data.doctor)).catch(() => toast.error('Failed to load doctor.')).finally(() => setLoading(false))
  }, [id])

  const loadPayouts = useCallback(() => {
    api.get(`/admin/doctors/${id}/payouts/`).then((r) => setPayouts(r.data.data.payouts || [])).catch(() => {}).finally(() => setPayoutsLoading(false))
  }, [id])

  useEffect(() => { loadDoctor(); loadPayouts() }, [loadDoctor, loadPayouts])

  const patch = async (payload: Record<string, any>, successMsg: string) => {
    setUpdating(true)
    try {
      const res = await api.patch(`/admin/doctors/${id}/`, payload)
      setDoctor(res.data.data.doctor)
      toast.success(successMsg)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed.')
    } finally {
      setUpdating(false)
    }
  }

  const markOnboardingPaid = async () => {
    setMarkingOnboarding(true)
    try {
      const res = await api.post(`/admin/doctors/${id}/mark-onboarding-paid/`)
      setDoctor(res.data.data.doctor)
      toast.success('Onboarding fee marked as paid.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to mark paid.')
    } finally {
      setMarkingOnboarding(false)
    }
  }

  const markPayoutPaid = async (payoutId: string) => {
    setMarkingPayoutId(payoutId)
    try {
      const res = await api.post(`/admin/doctors/${id}/payouts/${payoutId}/mark-paid/`)
      setPayouts((prev) => prev.map((p) => (p.id === payoutId ? res.data.data.payout : p)))
      toast.success('Marked as paid.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to mark paid.')
    } finally {
      setMarkingPayoutId(null)
    }
  }

  const startEdit = () => {
    if (!doctor) return
    setEditForm({
      name: doctor.name, specialty: doctor.specialty, qualification: doctor.qualification || '',
      experience_years: doctor.experience_years, consultation_fee: doctor.consultation_fee,
      photo_url: doctor.photo_url || '', bio: doctor.bio || '', languages: doctor.languages || '',
      is_active: doctor.is_active,
    })
    setEditing(true)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingEdit(true)
    try {
      const res = await api.put(`/admin/doctors/${id}/`, {
        ...editForm,
        experience_years: Number(editForm.experience_years) || 0,
        consultation_fee: Number(editForm.consultation_fee),
      })
      setDoctor((prev) => (prev ? { ...prev, ...res.data.data.doctor } : res.data.data.doctor))
      toast.success('Doctor details updated.')
      setEditing(false)
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Update failed.')
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!doctor) return <div className="text-center py-24"><p className="text-base text-on-surface">Doctor not found.</p><Link href="/admin/doctor-consult" className="text-sm text-primary hover:underline mt-2 block">Back to Doctor Consult</Link></div>

  const hasAccount = doctor.email != null
  const photoSrc = resolveImg(doctor.photo_url)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/doctor-consult" className="hover:text-primary transition-colors">Doctor Consult</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Dr. {doctor.name}</span>
      </div>

      {/* Header */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {photoSrc ? <img src={photoSrc} alt="" className="w-full h-full object-cover" /> : (
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '26px' }}>stethoscope</span>
            )}
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface">Dr. {doctor.name}</p>
            <p className="text-xs text-on-surface-variant">{doctor.specialty} · NPR {Number(doctor.consultation_fee).toFixed(0)} / consult</p>
            <p className="text-xs text-on-surface-variant font-mono">{doctor.license_number || 'No license number on file'}</p>
          </div>
        </div>
        {hasAccount && (
          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={updating}
              onClick={() => patch({ is_verified: !doctor.is_verified }, doctor.is_verified ? 'Doctor unverified.' : 'Doctor verified — they can now accept appointments.')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${doctor.is_verified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
              {doctor.is_verified ? 'Verified' : 'Pending Verification'}
            </button>
            <button disabled={updating}
              onClick={() => patch({ user_is_active: !doctor.user_is_active }, doctor.user_is_active ? 'Account suspended.' : 'Account reactivated.')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${doctor.user_is_active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-error/10 text-error hover:bg-error/20'}`}>
              {doctor.user_is_active ? 'Account Active' : 'Account Suspended'}
            </button>
            <button onClick={startEdit}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              Edit Details
            </button>
          </div>
        )}
      </div>

      {!hasAccount ? (
        <LinkAccountForm doctorId={id} onLinked={(d) => setDoctor(d)} />
      ) : (
        <>
          {editing && (
            <form onSubmit={saveEdit} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
              <p className="text-sm font-bold text-on-surface">Edit Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Name</label>
                  <input type="text" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Specialty</label>
                  <input type="text" required value={editForm.specialty} onChange={(e) => setEditForm((p) => ({ ...p, specialty: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Qualification</label>
                  <input type="text" value={editForm.qualification} onChange={(e) => setEditForm((p) => ({ ...p, qualification: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Languages</label>
                  <input type="text" value={editForm.languages} onChange={(e) => setEditForm((p) => ({ ...p, languages: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Experience (years)</label>
                  <input type="number" min="0" value={editForm.experience_years} onChange={(e) => setEditForm((p) => ({ ...p, experience_years: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Consultation Fee (NPR)</label>
                  <input type="number" min="0" required value={editForm.consultation_fee} onChange={(e) => setEditForm((p) => ({ ...p, consultation_fee: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Photo URL</label>
                <input type="text" value={editForm.photo_url} onChange={(e) => setEditForm((p) => ({ ...p, photo_url: e.target.value }))} placeholder="https://..."
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Bio</label>
                <textarea rows={3} value={editForm.bio} onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                <input type="checkbox" checked={editForm.is_active} onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))} className="accent-primary" />
                Active (visible for booking)
              </label>
              <div className="flex gap-3">
                <button type="submit" disabled={savingEdit}
                  className="px-5 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                  className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Onboarding fee */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-5">
            <p className="text-sm font-bold text-on-surface mb-3">Onboarding Fee</p>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-lg font-bold text-on-surface">{fmt(doctor.onboarding_fee_amount || '0')}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {doctor.onboarding_fee_paid
                    ? `Paid${doctor.onboarding_fee_paid_at ? ` on ${fmtDate(doctor.onboarding_fee_paid_at)}` : ''}`
                    : 'Not yet marked as paid — this tracks an off-system payment, nothing here processes it.'}
                </p>
              </div>
              {doctor.onboarding_fee_paid ? (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">Paid</span>
              ) : (
                <button onClick={markOnboardingPaid} disabled={markingOnboarding}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  {markingOnboarding ? 'Marking...' : 'Mark Paid'}
                </button>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
            <p className="text-sm font-bold text-on-surface">Contact</p>
            <div className="text-sm text-on-surface-variant space-y-1">
              <p><span className="text-on-surface font-medium">Email:</span> {doctor.email}</p>
            </div>
          </div>

          {/* Payout ledger */}
          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
            <div className="p-5 pb-3">
              <p className="text-sm font-bold text-on-surface">Payout Ledger</p>
              <p className="text-xs text-on-surface-variant mt-0.5">What the platform owes this doctor for completed consultations.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low border-b border-outline-variant">
                  <tr>
                    {['Appointment', 'Gross', 'Commission', 'Net Payable', 'Status', 'Paid', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {payoutsLoading ? (
                    [...Array(3)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
                  ) : payouts.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No payouts yet</td></tr>
                  ) : payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(p.appointment_date)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{fmt(p.gross_amount)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{fmt(p.commission_amount)} <span className="text-[10px]">({Number(p.commission_rate)}%)</span></td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{fmt(p.net_payable)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${p.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                      <td className="px-4 py-3">
                        {p.status === 'PENDING' && (
                          <button onClick={() => markPayoutPaid(p.id)} disabled={markingPayoutId === p.id}
                            className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap">
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
