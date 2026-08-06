'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Prescription } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  VERIFIED: 'bg-emerald-50 text-emerald-600',
  REJECTED: 'bg-error/10 text-error',
  EXPIRED: 'bg-surface-container text-on-surface-variant',
}

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [notes, setNotes] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    api.get('/prescriptions/').then((r) => setPrescriptions(r.data.data.prescriptions || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    const files = fileRef.current?.files
    if (!files || files.length === 0) { toast.error('Please select at least one file.'); return }
    if (files.length > 10) { toast.error('You can upload up to 10 files at once.'); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type)) { toast.error('Only JPG, PNG, WebP, or PDF allowed.'); return }
      if (file.size > 5 * 1024 * 1024) { toast.error('Each file must be under 5MB.'); return }
    }

    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append('files', file))
    if (notes) formData.append('notes', notes)

    setUploading(true)
    try {
      await api.post('/prescriptions/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(files.length > 1 ? `${files.length} prescriptions uploaded!` : 'Prescription uploaded!')
      setNotes('')
      setSelectedCount(0)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await api.delete(`/prescriptions/${id}/`)
      setPrescriptions((p) => p.filter((rx) => rx.id !== id))
      toast.success('Prescription deleted.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete prescription.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">My Prescriptions</h1>

      <form onSubmit={handleUpload} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <p className="text-sm font-bold text-on-surface">Upload New Prescription</p>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-outline-variant rounded-2xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '40px' }}>upload_file</span>
          <p className="text-sm font-medium text-on-surface mt-2">
            {selectedCount > 0 ? `${selectedCount} file${selectedCount > 1 ? 's' : ''} selected` : 'Click to upload prescription(s)'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">JPG, PNG, WebP, or PDF · Max 5MB each · Up to 10 files</p>
          <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden"
            onChange={(e) => setSelectedCount(e.target.files?.length || 0)} />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Notes (optional)</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Dr. Smith's prescription for hypertension"
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <button type="submit" disabled={uploading}
          className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
          {uploading ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Uploading...</> : 'Upload Prescription'}
        </button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>description</span>
          <p className="text-base font-medium text-on-surface mt-3">No prescriptions uploaded yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Prescriptions you upload will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '24px' }}>description</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface">{rx.file_name || 'Prescription'}</p>
                {rx.notes && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{rx.notes}</p>}
                <p className="text-xs text-on-surface-variant mt-0.5">{new Date(rx.uploaded_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                {rx.status === 'REJECTED' && rx.rejection_reason && (
                  <p className="text-xs text-error mt-0.5">Reason: {rx.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_COLORS[rx.status] || 'bg-surface-container text-on-surface-variant'}`}>
                  {rx.status}
                </span>
                {rx.file_url && (
                  <a href={rx.file_url} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>open_in_new</span>
                  </a>
                )}
                <button onClick={() => handleDelete(rx.id)} disabled={deletingId === rx.id}
                  className="w-8 h-8 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-error/10 hover:border-error/30 hover:text-error transition-colors disabled:opacity-50">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                    {deletingId === rx.id ? 'progress_activity' : 'delete'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
