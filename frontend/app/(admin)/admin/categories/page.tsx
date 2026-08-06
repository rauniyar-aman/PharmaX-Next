'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Category } from '@/types'

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Medicines in this category will be uncategorized.')) return
    setDeleting(id)
    try {
      await api.delete(`/admin/categories/${id}/`)
      toast.success('Category deleted.')
      setCategories((p) => p.filter((c) => c.id !== id))
    } catch {
      toast.error('Failed to delete.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{categories.length} categories</p>
        <Link href="/admin/categories/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Category
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-24 animate-pulse" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>category</span>
          <p className="text-base font-medium text-on-surface mt-3">No categories yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat, i) => (
            <div key={cat.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${i % 2 === 0 ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '24px' }}>{cat.icon || 'category'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface">{cat.name}</p>
                {cat.medicine_count !== undefined && (
                  <p className="text-xs text-on-surface-variant">{cat.medicine_count} medicines</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link href={`/admin/categories/${cat.id}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                </Link>
                <button onClick={() => handleDelete(cat.id)} disabled={deleting === cat.id}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 transition-colors text-error">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
