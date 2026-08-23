'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function AddDoctorPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', specialty: '', qualification: '', experience_years: '', consultation_fee: '',
    photo_url: '', bio: '', languages: '', is_active: true,
    email: '', phone: '', password: '', license_number: '', onboarding_fee_amount: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/doctors/', {
        ...form,
        experience_years: Number(form.experience_years) || 0,
        consultation_fee: Number(form.consultation_fee),
        onboarding_fee_amount: Number(form.onboarding_fee_amount) || 0,
      })
      toast.success('Doctor added!')
      router.push('/admin/doctor-consult')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to add doctor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/doctor-consult" className="hover:text-primary transition-colors">Doctor Consult</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Doctor</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Doctor</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Doctor Name *</label>
              <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="e.g., Anjali Sharma"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Specialty *</label>
              <input type="text" required value={form.specialty} onChange={(e) => set('specialty', e.target.value)}
                placeholder="e.g., General Physician"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Qualification</label>
              <input type="text" value={form.qualification} onChange={(e) => set('qualification', e.target.value)}
                placeholder="e.g., MBBS, MD"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Languages</label>
              <input type="text" value={form.languages} onChange={(e) => set('languages', e.target.value)}
                placeholder="e.g., English, Nepali, Hindi"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Experience (years)</label>
              <input type="number" min="0" value={form.experience_years} onChange={(e) => set('experience_years', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Consultation Fee (NPR) *</label>
              <input type="number" min="0" required value={form.consultation_fee} onChange={(e) => set('consultation_fee', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Photo URL</label>
            <input type="text" value={form.photo_url} onChange={(e) => set('photo_url', e.target.value)} placeholder="https://..."
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Bio</label>
            <textarea rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-primary" />
            Active (visible for booking)
          </label>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div>
            <p className="text-sm font-bold text-on-surface">Login Account</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Created together with the doctor record, same as a pharmacy or delivery agent account.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Email *</label>
              <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Phone *</label>
              <input type="text" required value={form.phone} onChange={(e) => set('phone', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Password *</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">License Number *</label>
              <input type="text" required value={form.license_number} onChange={(e) => set('license_number', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Onboarding Fee (NPR)</label>
              <input type="number" min="0" value={form.onboarding_fee_amount} onChange={(e) => set('onboarding_fee_amount', e.target.value)}
                placeholder="0"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Add Doctor'}
          </button>
          <Link href="/admin/doctor-consult" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
