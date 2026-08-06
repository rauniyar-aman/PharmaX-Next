'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Medicine } from '@/types'

export default function AdminMedicinesPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchMeds = useCallback(() => {
    setLoading(true)
    const params: any = { page, limit: 15 }
    if (search) params.search = search
    api.get('/admin/medicines/', { params })
      .then((r) => {
        setMedicines(r.data.data.medicines || [])
        setTotal(r.data.data.pagination?.total || 0)
        setTotalPages(r.data.data.pagination?.totalPages || 1)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [search, page])

  useEffect(() => { fetchMeds() }, [fetchMeds])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this medicine?')) return
    setDeleting(id)
    try {
      await api.delete(`/admin/medicines/${id}/`)
      toast.success('Medicine deleted.')
      fetchMeds()
    } catch {
      toast.error('Failed to delete.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input type="text" placeholder="Search medicines..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <Link href="/admin/medicines/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Medicine
        </Link>
      </div>
      <p className="text-xs text-on-surface-variant">{total} medicines total</p>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Medicine', 'Category', 'Type', 'Price (NPR)', 'Stock', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>
                ))
              ) : medicines.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No medicines found</td></tr>
              ) : medicines.map((med) => (
                <tr key={med.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {med.image_url ? (
                        <img src={med.image_url} alt={med.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>medication</span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-on-surface">{med.name}</p>
                        <p className="text-xs text-on-surface-variant">{med.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{(med as any).category_name || (med.category as any)?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${med.type === 'Rx' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>{med.type}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-on-surface">{Number(med.price).toFixed(0)}</td>
                  <td className="px-4 py-3 text-on-surface">{med.stock_quantity}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${med.in_stock ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
                      {med.in_stock ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/admin/medicines/${med.id}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                      </Link>
                      <button onClick={() => handleDelete(med.id)} disabled={deleting === med.id}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          {[...Array(Math.min(totalPages, 7))].map((_, i) => (
            <button key={i + 1} onClick={() => setPage(i + 1)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}
