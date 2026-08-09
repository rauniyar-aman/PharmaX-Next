'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { AdminPharmacyDetail, PharmacyDocument } from '@/types'

const DOC_TYPES: { type: PharmacyDocument['doc_type']; label: string; hint: string; adminUploaded: boolean }[] = [
  { type: 'PAN_CARD', label: 'PAN Card', hint: 'Uploaded by the pharmacy.', adminUploaded: false },
  { type: 'CITIZENSHIP', label: 'Owner Citizenship', hint: 'Uploaded by the pharmacy.', adminUploaded: false },
  { type: 'CANCELLED_CHEQUE', label: 'Cancelled Cheque', hint: 'Uploaded by the pharmacy as proof of their bank account.', adminUploaded: false },
  { type: 'MOU', label: 'Signed MOU', hint: 'Upload once the agreement is signed.', adminUploaded: true },
]

const REQUEST_STAT_CFG = [
  { key: 'accepted', label: 'Accepted', color: 'text-emerald-600', icon: 'check_circle' },
  { key: 'declined', label: 'Declined', color: 'text-error', icon: 'thumb_down' },
  { key: 'expired', label: 'Ignored (Expired)', color: 'text-on-surface-variant', icon: 'schedule' },
  { key: 'pending', label: 'Awaiting Response', color: 'text-amber-600', icon: 'hourglass_top' },
] as const

export default function AdminPharmacyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [pharmacy, setPharmacy] = useState<AdminPharmacyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const docFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = () => api.get(`/admin/pharmacies/${id}/`).then((r) => setPharmacy(r.data.data.pharmacy)).catch(() => toast.error('Failed to load pharmacy.')).finally(() => setLoading(false))

  useEffect(() => { load() }, [id])

  const patch = async (payload: Record<string, any>, successMsg: string) => {
    setUpdating(true)
    try {
      const res = await api.patch(`/admin/pharmacies/${id}/`, payload)
      setPharmacy((prev) => (prev ? { ...prev, ...res.data.data.pharmacy } : prev))
      toast.success(successMsg)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed.')
    } finally {
      setUpdating(false)
    }
  }

  const handleDocUpload = async (docType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) { toast.error('Only JPG, PNG, WebP, or PDF files are allowed.'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('File must be under 5MB.'); return }

    const formData = new FormData()
    formData.append('doc_type', docType)
    formData.append('file', file)
    setUploadingDoc(docType)
    try {
      await api.post(`/admin/pharmacies/${id}/documents/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document uploaded.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document.')
    } finally {
      setUploadingDoc(null)
      const input = docFileRefs.current[docType]
      if (input) input.value = ''
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!pharmacy) return <div className="text-center py-24"><p className="text-base text-on-surface">Pharmacy not found.</p><Link href="/admin/pharmacies" className="text-sm text-primary hover:underline mt-2 block">Back to Pharmacies</Link></div>

  const logoSrc = resolveImg(pharmacy.logo_url)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/pharmacies" className="hover:text-primary transition-colors">Pharmacies</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{pharmacy.name}</span>
      </div>

      {/* Header */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoSrc ? <img src={logoSrc} alt="" className="w-full h-full object-cover" /> : (
              <span className="material-symbols-outlined text-primary" style={{ fontSize: '26px' }}>storefront</span>
            )}
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface">{pharmacy.name}</p>
            <p className="text-xs text-on-surface-variant font-mono">{pharmacy.license_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button disabled={updating}
            onClick={() => patch({ is_verified: !pharmacy.is_verified }, pharmacy.is_verified ? 'Pharmacy unverified.' : 'Pharmacy verified.')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${pharmacy.is_verified ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
            {pharmacy.is_verified ? 'Verified' : 'Pending Verification'}
          </button>
          <button disabled={updating}
            onClick={() => patch({ user_is_active: !pharmacy.user_is_active }, pharmacy.user_is_active ? 'Account suspended.' : 'Account reactivated.')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${pharmacy.user_is_active ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-error/10 text-error hover:bg-error/20'}`}>
            {pharmacy.user_is_active ? 'Account Active' : 'Account Suspended'}
          </button>
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${pharmacy.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
            {pharmacy.is_active ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Performance stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface rounded-2xl border border-outline-variant p-4">
          <p className="text-xl font-bold text-on-surface">{pharmacy.listings_count}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Listed Medicines</p>
        </div>
        {REQUEST_STAT_CFG.map((s) => (
          <div key={s.key} className="bg-surface rounded-2xl border border-outline-variant p-4">
            <p className={`text-xl font-bold ${s.color}`}>{pharmacy.request_stats[s.key]}</p>
            <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{s.icon}</span>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Finance */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <p className="text-sm font-bold text-on-surface mb-3">Finance</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-lg font-bold text-on-surface">NPR {Number(pharmacy.finance.total_earned).toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Total Earned (Gross)</p>
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface">NPR {Number(pharmacy.finance.total_commission).toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Commission Retained</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">NPR {Number(pharmacy.finance.total_paid).toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Paid Out</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600">NPR {Number(pharmacy.finance.total_pending).toFixed(0)}</p>
            <p className="text-xs text-on-surface-variant">Pending Payout</p>
          </div>
        </div>
      </div>

      {/* Contact & Address */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Contact</p>
          <div className="text-sm text-on-surface-variant space-y-1">
            <p><span className="text-on-surface font-medium">Email:</span> {pharmacy.email}</p>
            <p><span className="text-on-surface font-medium">Phone:</span> {pharmacy.phone}</p>
            <p><span className="text-on-surface font-medium">Contact Person:</span> {pharmacy.contact_person_name || '—'}</p>
            <p><span className="text-on-surface font-medium">Contact Phone:</span> {pharmacy.contact_person_phone || '—'}</p>
          </div>
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
          <p className="text-sm font-bold text-on-surface">Address</p>
          <p className="text-sm text-on-surface-variant">{pharmacy.address}</p>
          <p className="text-xs text-on-surface-variant">{pharmacy.lat.toFixed(5)}, {pharmacy.lng.toFixed(5)}</p>
        </div>
      </div>

      {/* Bank details */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <p className="text-sm font-bold text-on-surface mb-2">Bank Details</p>
        {pharmacy.bank_account_number ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <p><span className="text-on-surface-variant">Bank:</span> <span className="text-on-surface">{pharmacy.bank_name || '—'}</span></p>
            <p><span className="text-on-surface-variant">Branch:</span> <span className="text-on-surface">{pharmacy.bank_branch || '—'}</span></p>
            <p><span className="text-on-surface-variant">Account Holder:</span> <span className="text-on-surface">{pharmacy.bank_account_holder_name || '—'}</span></p>
            <p><span className="text-on-surface-variant">Account Number:</span> <span className="text-on-surface font-mono">{pharmacy.bank_account_number}</span></p>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">The pharmacy hasn't added bank details yet.</p>
        )}
      </div>

      {/* Documents */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Documents</p>
        <div className="space-y-2">
          {DOC_TYPES.map((d) => {
            const doc = pharmacy.documents.find((x) => x.doc_type === d.type)
            return (
              <div key={d.type} className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">{d.label}</p>
                  <p className="text-xs text-on-surface-variant">{d.hint}</p>
                  {doc && <p className="text-[11px] text-emerald-600 mt-0.5">Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}{doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc ? (
                    <a href={resolveImg(doc.file_url) || '#'} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors">
                      View
                    </a>
                  ) : (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">Not uploaded</span>
                  )}
                  {d.adminUploaded && (
                    <>
                      <button type="button" onClick={() => docFileRefs.current[d.type]?.click()} disabled={uploadingDoc === d.type}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                        {uploadingDoc === d.type ? 'Uploading...' : doc ? 'Replace' : 'Upload'}
                      </button>
                      <input ref={(el) => { docFileRefs.current[d.type] = el }} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden" onChange={(e) => handleDocUpload(d.type, e)} />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
