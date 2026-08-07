'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { HealthRecord, HealthRecordType, Prescription, LabTestBooking } from '@/types'

const RECORD_TYPES: { val: HealthRecordType; label: string; icon: string }[] = [
  { val: 'PRESCRIPTION', label: 'Prescription', icon: 'description' },
  { val: 'LAB_REPORT', label: 'Lab Report', icon: 'biotech' },
  { val: 'VACCINATION', label: 'Vaccination Certificate', icon: 'vaccines' },
  { val: 'DISCHARGE_SUMMARY', label: 'Discharge Summary', icon: 'local_hospital' },
  { val: 'OTHER', label: 'Other', icon: 'folder' },
]

const TYPE_ICON: Record<string, string> = {
  PRESCRIPTION: 'description', LAB_REPORT: 'biotech', VACCINATION: 'vaccines',
  DISCHARGE_SUMMARY: 'local_hospital', OTHER: 'folder',
}

type LockerItem = {
  id: string
  title: string
  subtitle?: string
  typeLabel: string
  icon: string
  date: string
  fileUrl?: string | null
  source: 'record' | 'prescription' | 'lab-report'
}

export default function HealthLockerPage() {
  const [items, setItems] = useState<LockerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [recordType, setRecordType] = useState<HealthRecordType>('OTHER')
  const [recordDate, setRecordDate] = useState('')
  const [notes, setNotes] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/health-records/'),
      api.get('/prescriptions/'),
      api.get('/lab-tests/bookings/'),
    ]).then(([recRes, rxRes, labRes]) => {
      const records: HealthRecord[] = recRes.data.data.records || []
      const prescriptions: Prescription[] = rxRes.data.data.prescriptions || []
      const bookings: LabTestBooking[] = labRes.data.data.bookings || []

      const merged: LockerItem[] = [
        ...records.map((r) => ({
          id: `record-${r.id}`, title: r.title, subtitle: r.notes || undefined,
          typeLabel: RECORD_TYPES.find((t) => t.val === r.record_type)?.label || 'Other',
          icon: TYPE_ICON[r.record_type] || 'folder',
          date: r.record_date || r.uploaded_at, fileUrl: r.file_url, source: 'record' as const,
        })),
        ...prescriptions.map((p) => ({
          id: `prescription-${p.id}`, title: p.file_name || 'Prescription', subtitle: p.notes || undefined,
          typeLabel: 'Prescription', icon: 'description',
          date: p.uploaded_at, fileUrl: p.file_url, source: 'prescription' as const,
        })),
        ...bookings.filter((b) => b.report_url).map((b) => ({
          id: `lab-${b.id}`, title: b.lab_test?.name || 'Lab Report', subtitle: b.lab_test?.category_name,
          typeLabel: 'Lab Report', icon: 'biotech',
          date: b.booked_at, fileUrl: b.report_url, source: 'lab-report' as const,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setItems(merged)
    }).catch(() => toast.error('Failed to load health records.')).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Please enter a title.'); return }
    const formData = new FormData()
    formData.append('title', title)
    formData.append('record_type', recordType)
    if (recordDate) formData.append('record_date', recordDate)
    if (notes) formData.append('notes', notes)
    if (fileRef.current?.files?.[0]) formData.append('file', fileRef.current.files[0])

    setUploading(true)
    try {
      await api.post('/health-records/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Record added to your Health Locker!')
      setTitle(''); setNotes(''); setRecordDate(''); setRecordType('OTHER')
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add record.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (item: LockerItem) => {
    const recordId = item.id.replace('record-', '')
    setDeletingId(item.id)
    try {
      await api.delete(`/health-records/${recordId}/`)
      setItems((p) => p.filter((i) => i.id !== item.id))
      toast.success('Record deleted.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete record.')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = filter === 'ALL' ? items : items.filter((i) => i.source === filter)

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-on-primary">
        <h1 className="text-2xl font-bold">Health Locker</h1>
        <p className="text-sm opacity-90 mt-1">All your prescriptions, lab reports and health documents in one place.</p>
      </div>

      <form onSubmit={handleUpload} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <p className="text-sm font-bold text-on-surface">Add a Health Document</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Blood Test — Jan 2026"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Record Type</label>
            <select value={recordType} onChange={(e) => setRecordType(e.target.value as HealthRecordType)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
              {RECORD_TYPES.map((t) => <option key={t.val} value={t.val}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Record Date (optional)</label>
            <input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">File (optional)</label>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="mt-1 w-full text-sm text-on-surface file:mr-3 file:px-3 file:py-2 file:rounded-xl file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Notes (optional)</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <button type="submit" disabled={uploading}
          className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
          {uploading ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Add to Locker'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {[
          { val: 'ALL', label: 'All' },
          { val: 'record', label: 'My Uploads' },
          { val: 'prescription', label: 'Prescriptions' },
          { val: 'lab-report', label: 'Lab Reports' },
        ].map((f) => (
          <button key={f.val} onClick={() => setFilter(f.val)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filter === f.val ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>folder_open</span>
          <p className="text-base font-medium text-on-surface mt-3">No health records yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Your prescriptions, lab reports and uploaded documents will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px' }}>{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{item.subtitle}</p>}
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {item.typeLabel} · {new Date(item.date).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.fileUrl && (
                  <a href={item.fileUrl} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>open_in_new</span>
                  </a>
                )}
                {item.source === 'record' && (
                  <button onClick={() => handleDelete(item)} disabled={deletingId === item.id}
                    className="w-8 h-8 rounded-xl border border-outline-variant flex items-center justify-center hover:bg-error/10 hover:border-error/30 hover:text-error transition-colors disabled:opacity-50">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                      {deletingId === item.id ? 'progress_activity' : 'delete'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
