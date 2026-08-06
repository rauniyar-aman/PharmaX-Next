'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'

const ICONS = ['medication', 'heart_plus', 'vaccines', 'medical_services', 'health_and_safety', 'science', 'healing', 'pediatrics', 'psychology', 'ophthalmology', 'dentistry', 'dermatology']

export default function AddCategoryPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/categories/', { name, description, icon: icon || undefined })
      toast.success('Category added!')
      router.push('/admin/categories')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add category.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/categories" className="hover:text-primary transition-colors">Categories</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Category</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Category</h1>
      <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Category Name *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Icon</label>
          <div className="mt-1 grid grid-cols-6 gap-2">
            {ICONS.map((ic) => (
              <button key={ic} type="button" onClick={() => setIcon(ic)}
                className={`aspect-square rounded-xl border flex items-center justify-center transition-colors ${icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{ic}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Add Category'}
          </button>
          <Link href="/admin/categories" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
