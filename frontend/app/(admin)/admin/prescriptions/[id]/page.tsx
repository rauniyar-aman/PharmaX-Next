'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
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

function isImageFile(name?: string | null) {
  return !!name && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(name)
}
function isPdfFile(name?: string | null) {
  return !!name && /\.pdf(\?|$)/i.test(name)
}

export default function AdminPrescriptionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [prescription, setPrescription] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalog, setCatalog] = useState<any[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [addingId, setAddingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/admin/prescriptions/${id}/`)
      .then((r) => setPrescription(r.data.data.prescription))
      .catch(() => toast.error('Failed to load prescription.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const isPending = prescription?.status === 'PENDING'

  useEffect(() => {
    if (!isPending) return
    setLoadingCatalog(true)
    const t = setTimeout(() => {
      api.get('/admin/medicines/', { params: { search: catalogSearch, limit: 20 } })
        .then((r) => setCatalog(r.data.data.medicines || []))
        .catch(() => toast.error('Failed to load medicine catalog.'))
        .finally(() => setLoadingCatalog(false))
    }, 300)
    return () => clearTimeout(t)
  }, [catalogSearch, isPending])

  const addItem = async (medicineId: string) => {
    const qty = Number(quantities[medicineId] ?? '1')
    if (!Number.isFinite(qty) || qty < 1) { toast.error('Enter a valid quantity.'); return }
    setAddingId(medicineId)
    try {
      await api.post(`/admin/prescriptions/${id}/medicine-items/`, { medicine_id: medicineId, quantity: qty })
      toast.success('Medicine added.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add medicine.')
    } finally {
      setAddingId(null)
    }
  }

  const removeItem = async (itemId: string) => {
    setRemovingId(itemId)
    try {
      await api.delete(`/admin/prescriptions/${id}/medicine-items/${itemId}/`)
      toast.success('Item removed.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove item.')
    } finally {
      setRemovingId(null)
    }
  }

  const updateStatus = async (status: string, rejection_reason?: string) => {
    setUpdating(true)
    try {
      await api.put(`/admin/prescriptions/${id}/`, { status, rejection_reason })
      toast.success(`Prescription ${status.toLowerCase()}.`)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update.')
    } finally {
      setUpdating(false)
    }
  }

  const handleReject = () => {
    const reason = window.prompt('Reason for rejecting this prescription:')
    if (reason === null) return
    if (!reason.trim()) { toast.error('A rejection reason is required.'); return }
    updateStatus('REJECTED', reason.trim())
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }
  if (!prescription) return null

  const items = prescription.medicine_items || []
  const fileUrl = resolveImg(prescription.file_url)
  const isImage = isImageFile(prescription.file_name) || isImageFile(prescription.file_url)
  const isPdf = isPdfFile(prescription.file_name) || isPdfFile(prescription.file_url)

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/prescriptions" className="hover:text-primary transition-colors">Prescriptions</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{prescription.customer?.full_name || 'Detail'}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-on-surface">{prescription.customer?.full_name}</p>
            <p className="text-xs text-on-surface-variant">{prescription.customer?.email}</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {[prescription.doctor, prescription.hospital].filter(Boolean).join(' · ') || 'No doctor/hospital info'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">Uploaded {new Date(prescription.uploaded_at).toLocaleDateString()}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[prescription.status] || 'bg-surface-container text-on-surface-variant'}`}>
            {prescription.status}
          </span>
        </div>

        {prescription.notes && (
          <p className="text-sm text-on-surface bg-surface-container-low rounded-xl p-3">{prescription.notes}</p>
        )}

        {prescription.status === 'REJECTED' && prescription.rejection_reason && (
          <p className="text-sm text-error">Reason: {prescription.rejection_reason}</p>
        )}

        {fileUrl && (
          isImage ? (
            <img src={fileUrl} alt="Prescription file" className="max-h-96 rounded-xl border border-outline-variant object-contain" />
          ) : isPdf ? (
            <div className="space-y-2">
              <iframe src={fileUrl} className="w-full h-96 rounded-xl border border-outline-variant" title="Prescription PDF" />
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                Open in new tab <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
              </a>
            </div>
          ) : (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              View file <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
            </a>
          )
        )}
      </div>

      {isPending && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
          <p className="text-sm font-bold text-on-surface">Add Medicines</p>
          <input type="text" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Search medicines by name or brand..."
            className="w-full max-w-md px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />

          <div className="border border-outline-variant rounded-xl overflow-hidden">
            <div className="divide-y divide-outline-variant max-h-80 overflow-y-auto">
              {loadingCatalog ? (
                [...Array(3)].map((_, i) => <div key={i} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></div>)
              ) : catalog.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-on-surface-variant">No medicines found.</div>
              ) : catalog.map((m) => (
                <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                    <p className="text-xs text-on-surface-variant">{m.brand_name} · NPR {Number(m.price).toFixed(0)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input type="number" min={1} value={quantities[m.id] ?? '1'}
                      onChange={(e) => setQuantities((p) => ({ ...p, [m.id]: e.target.value }))}
                      className="w-16 px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                    <button onClick={() => addItem(m.id)} disabled={addingId === m.id}
                      className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Curated Medicines ({items.length})</p>
        {items.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No medicines added yet.</p>
        ) : (
          <div className="divide-y divide-outline-variant">
            {items.map((item: any) => (
              <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{item.medicine?.name}</p>
                  <p className="text-xs text-on-surface-variant">Qty {item.quantity} · NPR {Number(item.medicine?.price || 0).toFixed(0)} each</p>
                </div>
                {isPending && (
                  <button onClick={() => removeItem(item.id)} disabled={removingId === item.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-60">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex items-center gap-3">
          <button onClick={() => updateStatus('VERIFIED')} disabled={updating}
            className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-opacity disabled:opacity-60 ${
              items.length > 0 ? 'bg-emerald-500 text-white hover:opacity-90' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'
            }`}>
            Verify{items.length > 0 ? ` (${items.length} medicine${items.length !== 1 ? 's' : ''})` : ''}
          </button>
          <button onClick={handleReject} disabled={updating}
            className="px-4 py-2.5 bg-error text-on-error text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
