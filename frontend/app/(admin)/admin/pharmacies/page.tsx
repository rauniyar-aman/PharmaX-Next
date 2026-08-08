'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { AdminPharmacy } from '@/types'

export default function AdminPharmaciesPage() {
  const [pharmacies, setPharmacies] = useState<AdminPharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/pharmacies/').then((r) => setPharmacies(r.data.data.pharmacies || [])).catch(() => toast.error('Failed to load pharmacies.')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const patch = async (id: string, payload: Record<string, any>, successMsg: string) => {
    setUpdatingId(id)
    try {
      const res = await api.patch(`/admin/pharmacies/${id}/`, payload)
      setPharmacies((prev) => prev.map((p) => (p.id === id ? res.data.data.pharmacy : p)))
      toast.success(successMsg)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{pharmacies.length} pharmac{pharmacies.length !== 1 ? 'ies' : 'y'}</p>
        <Link href="/admin/pharmacies/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Pharmacy
        </Link>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Email', 'License #', 'Verified', 'Account'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : pharmacies.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">No pharmacies yet</td></tr>
              ) : pharmacies.map((p) => (
                <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{p.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.email}</td>
                  <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">{p.license_number}</td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === p.id}
                      onClick={() => patch(p.id, { is_verified: !p.is_verified }, p.is_verified ? 'Pharmacy unverified.' : 'Pharmacy verified — it can now receive orders.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${p.is_verified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
                      {p.is_verified ? 'Verified' : 'Pending Verification'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={updatingId === p.id}
                      onClick={() => patch(p.id, { user_is_active: !p.user_is_active }, p.user_is_active ? 'Pharmacy account suspended.' : 'Pharmacy account reactivated.')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 ${p.user_is_active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-error/10 text-error hover:bg-error/20'}`}>
                      {p.user_is_active ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
