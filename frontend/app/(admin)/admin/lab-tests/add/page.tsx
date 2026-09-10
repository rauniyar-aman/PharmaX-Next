'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTest, LabTestCategory } from '@/types'

const EMPTY = {
  name: '', category_id: '', sample_type: 'BLOOD', fasting_required: false,
  reporting_time: '', is_package: false, price: '', original_price: '',
  parameters_included: '', description: '', is_active: true,
  included_test_ids: [] as string[],
}

export default function AddLabTestPage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [categories, setCategories] = useState<LabTestCategory[]>([])
  const [candidates, setCandidates] = useState<LabTest[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/lab-tests/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {})
    // Only individual (non-package) active tests can be members — no nested packages. Capped at the
    // list endpoint's max page size; the search below filters this pool client-side.
    api.get('/admin/lab-tests/', { params: { limit: 50 } })
      .then((r) => setCandidates((r.data.data.labTests || []).filter((t: LabTest) => !t.is_package)))
      .catch(() => {})
  }, [])

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }))

  const toggleMember = (id: string) => setForm((p) => ({
    ...p,
    included_test_ids: p.included_test_ids.includes(id) ? p.included_test_ids.filter((x) => x !== id) : [...p.included_test_ids, id],
  }))
  const filteredCandidates = candidates.filter((t) => t.name.toLowerCase().includes(memberSearch.toLowerCase()))
  const selectedMembers = form.included_test_ids.map((id) => candidates.find((t) => t.id === id)).filter(Boolean) as LabTest[]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/lab-tests/', {
        ...form,
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : Number(form.price),
        // Members only mean anything for a package; clear them otherwise so toggling the box off can't
        // leave orphaned membership behind.
        included_test_ids: form.is_package ? form.included_test_ids : [],
      })
      toast.success('Lab test added!')
      router.push('/admin/lab-tests')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to add lab test.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/lab-tests" className="hover:text-primary transition-colors">Lab Tests</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Lab Test</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Lab Test</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Basic Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Test Name *</label>
              <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-on-surface-variant">Category *</label>
              </div>
              <select required value={form.category_id} onChange={(e) => set('category_id', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Sample Type</label>
              <select value={form.sample_type} onChange={(e) => set('sample_type', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="BLOOD">Blood</option>
                <option value="URINE">Urine</option>
                <option value="SWAB">Swab</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Reporting Time (e.g., 24 hours)</label>
              <input type="text" value={form.reporting_time} onChange={(e) => set('reporting_time', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.fasting_required} onChange={(e) => set('fasting_required', e.target.checked)} className="accent-primary" />
              Fasting Required
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.is_package} onChange={(e) => set('is_package', e.target.checked)} className="accent-primary" />
              This is a Package (bundle of tests)
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-primary" />
              Active
            </label>
          </div>

          {form.is_package && (
            <div className="border-t border-outline-variant pt-4">
              <label className="text-xs font-medium text-on-surface-variant">Tests Included in This Package</label>
              <p className="text-[11px] text-on-surface-variant mt-0.5 mb-2">
                Pick the individual tests this package covers. Booking the package still creates one booking at the package price — these are shown to customers for reference.
              </p>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedMembers.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                      {t.name}
                      <button type="button" onClick={() => toggleMember(t.id)} aria-label={`Remove ${t.name}`} className="hover:text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search tests to add..."
                className="w-full px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
              <div className="mt-2 max-h-52 overflow-y-auto border border-outline-variant rounded-xl divide-y divide-outline-variant">
                {filteredCandidates.length === 0 ? (
                  <p className="text-xs text-on-surface-variant p-3">No individual tests found. Create some non-package tests first.</p>
                ) : filteredCandidates.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-surface-container transition-colors">
                    <input type="checkbox" checked={form.included_test_ids.includes(t.id)} onChange={() => toggleMember(t.id)} className="accent-primary" />
                    <span className="text-sm text-on-surface flex-1">{t.name}</span>
                    <span className="text-xs text-on-surface-variant">{t.category?.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Pricing</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Price (NPR) *</label>
              <input type="number" min="0" required value={form.price} onChange={(e) => set('price', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Original Price (NPR)</label>
              <input type="number" min="0" value={form.original_price} onChange={(e) => set('original_price', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Details</p>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Parameters Included</label>
            <textarea rows={2} value={form.parameters_included} onChange={(e) => set('parameters_included', e.target.value)}
              placeholder="e.g., CBC, Lipid Profile, Thyroid Panel, Vitamin D, B12"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Add Lab Test'}
          </button>
          <Link href="/admin/lab-tests" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
