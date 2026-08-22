'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  VERIFIED: 'bg-emerald-50 text-emerald-600',
  REJECTED: 'bg-error/10 text-error',
  EXPIRED: 'bg-surface-container text-on-surface-variant',
}

export default function AdminPrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [updating, setUpdating] = useState<string | null>(null)

  const load = (status = statusFilter) => {
    setLoading(true)
    const params: any = {}
    if (status !== 'ALL') params.status = status
    api.get('/admin/prescriptions/', { params }).then((r) => setPrescriptions(r.data.data.prescriptions || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const updateStatus = async (id: string, status: string, rejection_reason?: string, admin_comment?: string) => {
    setUpdating(id)
    try {
      await api.put(`/admin/prescriptions/${id}/`, { status, rejection_reason, admin_comment })
      toast.success(`Prescription ${status.toLowerCase()}.`)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update.')
    } finally {
      setUpdating(null)
    }
  }

  const handleVerify = (id: string) => {
    const comment = window.prompt('Add an optional comment for the customer (leave blank to skip):', '')
    if (comment === null) return
    updateStatus(id, 'VERIFIED', undefined, comment.trim())
  }

  const handleReject = (id: string) => {
    const reason = window.prompt('Reason for rejecting this prescription:')
    if (reason === null) return
    if (!reason.trim()) { toast.error('A rejection reason is required.'); return }
    const comment = window.prompt('Add an optional additional comment for the customer (leave blank to skip):', '')
    updateStatus(id, 'REJECTED', reason.trim(), (comment || '').trim())
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-surface rounded-2xl border border-outline-variant animate-pulse" />)}</div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>description</span>
          <p className="text-base font-medium text-on-surface mt-3">No prescriptions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-wrap items-center gap-4">
              <div className="w-10 h-10 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '22px' }}>description</span>
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/admin/prescriptions/${rx.id}`} className="block hover:opacity-80 transition-opacity">
                  <p className="text-sm font-semibold text-on-surface">{rx.customer?.full_name || 'Customer'}</p>
                  <p className="text-xs text-on-surface-variant">{rx.customer?.email}</p>
                  {rx.notes && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{rx.notes}</p>}
                  <p className="text-xs text-on-surface-variant mt-0.5">{new Date(rx.uploaded_at).toLocaleDateString()}</p>
                  {rx.status === 'REJECTED' && rx.rejection_reason && (
                    <p className="text-xs text-error mt-0.5">Reason: {rx.rejection_reason}</p>
                  )}
                  {rx.admin_comment && (
                    <p className="text-xs text-on-surface-variant mt-0.5 italic">"{rx.admin_comment}"</p>
                  )}
                </Link>
                {rx.order && (
                  <Link href={`/admin/orders/${rx.order.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline mt-0.5">
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>receipt_long</span>
                    Order #{rx.order.id.slice(0, 8).toUpperCase()}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[rx.status] || 'bg-surface-container text-on-surface-variant'}`}>
                  {rx.status}
                </span>
                <Link href={`/admin/prescriptions/${rx.id}`}
                  className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
                </Link>
                {rx.file_url && (
                  <a href={resolveImg(rx.file_url) || undefined} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                  </a>
                )}
                {rx.status === 'PENDING' && (
                  <>
                    <button onClick={() => handleVerify(rx.id)} disabled={updating === rx.id}
                      className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                      Verify
                    </button>
                    <button onClick={() => handleReject(rx.id)} disabled={updating === rx.id}
                      className="px-3 py-1.5 bg-error text-on-error text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
