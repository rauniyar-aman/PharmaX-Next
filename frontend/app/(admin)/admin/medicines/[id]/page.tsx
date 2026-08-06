'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Category } from '@/types'

export default function EditMedicinePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [form, setForm] = useState<any>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/admin/medicines/${id}/`),
      api.get('/categories/'),
    ]).then(([medRes, catRes]) => {
      const m = medRes.data.data.medicine
      setForm({
        name: m.name || '',
        brand: m.brand || '',
        category_id: m.category?.id || '',
        type: m.type || 'OTC',
        price: m.price || '',
        original_price: m.original_price || '',
        stock_quantity: m.stock_quantity ?? 0,
        in_stock: m.in_stock ?? true,
        package_size: m.package_size || '',
        manufacturer: m.manufacturer || '',
        image_url: m.image_url || '',
        dosage: m.dosage || '',
        usage: m.usage || '',
        description: m.description || '',
        side_effects: m.side_effects || '',
        expiry_date: m.expiry_date || '',
      })
      setCategories(catRes.data.data.categories || [])
    }).catch(() => toast.error('Failed to load.')).finally(() => setLoading(false))
  }, [id])

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put(`/admin/medicines/${id}/`, {
        ...form,
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : Number(form.price),
        stock_quantity: Number(form.stock_quantity),
        expiry_date: form.expiry_date || null,
      })
      toast.success('Medicine updated!')
      router.push('/admin/medicines')
    } catch (err: any) {
      const data = err.response?.data
      const msgs = data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Update failed.'
      toast.error(msgs)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!form) return null

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/medicines" className="hover:text-primary transition-colors">Medicines</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Edit</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Edit Medicine</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Basic Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { k: 'name', l: 'Medicine Name', req: true },
              { k: 'brand', l: 'Brand', req: true },
              { k: 'manufacturer', l: 'Manufacturer', req: false },
              { k: 'package_size', l: 'Package Size', req: false },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs font-medium text-on-surface-variant">{f.l}</label>
                <input type="text" required={f.req} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Category</label>
              <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Type</label>
              <select value={form.type} onChange={(e) => set('type', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="OTC">OTC</option>
                <option value="Rx">Rx</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Pricing & Stock</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { k: 'price', l: 'Price (NPR)' },
              { k: 'original_price', l: 'Original Price' },
              { k: 'stock_quantity', l: 'Stock Quantity' },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs font-medium text-on-surface-variant">{f.l}</label>
                <input type="number" min="0" value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.in_stock} onChange={(e) => set('in_stock', e.target.checked)} className="accent-primary" />
              In Stock
            </label>
            <div className="flex-1">
              <label className="text-xs font-medium text-on-surface-variant">Expiry Date</label>
              <input type="date" value={form.expiry_date || ''} onChange={(e) => set('expiry_date', e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <p className="text-sm font-bold text-on-surface">Details</p>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Image URL</label>
            <input type="text" value={form.image_url} onChange={(e) => set('image_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Dosage</label>
            <input type="text" value={form.dosage} onChange={(e) => set('dosage', e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          {[
            { k: 'description', l: 'Description', rows: 3 },
            { k: 'usage', l: 'Usage / Directions', rows: 2 },
            { k: 'side_effects', l: 'Side Effects', rows: 2 },
          ].map((f) => (
            <div key={f.k}>
              <label className="text-xs font-medium text-on-surface-variant">{f.l}</label>
              <textarea rows={f.rows} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
          </button>
          <Link href="/admin/medicines" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
