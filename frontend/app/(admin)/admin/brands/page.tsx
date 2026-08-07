'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Brand } from '@/types'

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/brands/').then((r) => setBrands(r.data.data.brands || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this brand? Medicines using this brand must be reassigned first.')) return
    setDeleting(id)
    try {
      await api.delete(`/admin/brands/${id}/`)
      toast.success('Brand deleted.')
      setBrands((p) => p.filter((b) => b.id !== id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{brands.length} brands</p>
        <Link href="/admin/brands/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Brand
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-24 animate-pulse" />)}
        </div>
      ) : brands.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>storefront</span>
          <p className="text-base font-medium text-on-surface mt-3">No brands yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((b, i) => (
            <div key={b.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${i % 2 === 0 ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                {b.name.trim().slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{b.name}</p>
                {b.manufacturer && <p className="text-xs text-on-surface-variant truncate">{b.manufacturer}</p>}
                <div className="flex items-center gap-2">
                  {b.medicine_count !== undefined && (
                    <p className="text-xs text-on-surface-variant">{b.medicine_count} medicines</p>
                  )}
                  {!b.is_active && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-error/10 text-error">Inactive</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link href={`/admin/brands/${b.id}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                </Link>
                <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id}
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
