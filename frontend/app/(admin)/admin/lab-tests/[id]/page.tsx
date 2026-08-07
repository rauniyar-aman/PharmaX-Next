'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTestCategory } from '@/types'

export default function EditLabTestPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [form, setForm] = useState<any>(null)
  const [categories, setCategories] = useState<LabTestCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/admin/lab-tests/${id}/`),
      api.get('/lab-tests/categories/'),
    ]).then(([testRes, catRes]) => {
      const t = testRes.data.data.labTest
      setForm({
        name: t.name || '',
        category_id: t.category?.id || '',
        sample_type: t.sample_type || 'BLOOD',
        fasting_required: t.fasting_required ?? false,
        reporting_time: t.reporting_time || '',
        is_package: t.is_package ?? false,
        price: t.price || '',
        original_price: t.original_price || '',
        parameters_included: t.parameters_included || '',
        description: t.description || '',
        is_active: t.is_active ?? true,
      })
      setCategories(catRes.data.data.categories || [])
    }).catch(() => toast.error('Failed to load lab test.')).finally(() => setLoading(false))
  }, [id])

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/admin/lab-tests/${id}/`, {
        ...form,
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : Number(form.price),
      })
      toast.success('Lab test updated!')
      router.push('/admin/lab-tests')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!form) return null

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/lab-tests" className="hover:text-primary transition-colors">Lab Tests</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Edit</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Edit Lab Test</h1>

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
              <label className="text-xs font-medium text-on-surface-variant">Category *</label>
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
              <label className="text-xs font-medium text-on-surface-variant">Reporting Time</label>
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
              This is a Package
            </label>
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-primary" />
              Active
            </label>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Pricing</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Price (NPR)</label>
              <input type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)}
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
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
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
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
          </button>
          <Link href="/admin/lab-tests" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
