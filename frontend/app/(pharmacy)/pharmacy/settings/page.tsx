'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import { usePharmacyProfileStore } from '@/store/pharmacyProfile'
import type { PharmacyProfile, PharmacyBusinessHoursDay, PharmacyDocument } from '@/types'
import type { PickedLocation } from '@/components/map/MapPicker'

const DOC_TYPES: { type: PharmacyDocument['doc_type']; label: string; hint: string; uploadedByPharmacy: boolean }[] = [
  { type: 'PAN_CARD', label: 'PAN Card', hint: 'Your tax registration document.', uploadedByPharmacy: true },
  { type: 'CITIZENSHIP', label: 'Owner Citizenship', hint: "The pharmacy owner's citizenship / ID document.", uploadedByPharmacy: true },
  { type: 'CANCELLED_CHEQUE', label: 'Cancelled Cheque', hint: 'Proof of the bank account entered above.', uploadedByPharmacy: true },
  { type: 'MOU', label: 'Signed MOU', hint: 'Provided by the PharmaX team once your agreement is signed.', uploadedByPharmacy: false },
]

const MapPicker = dynamic(() => import('@/components/map/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

export default function PharmacySettingsPage() {
  const pharmacy = usePharmacyProfileStore((s) => s.pharmacy)
  const setPharmacy = usePharmacyProfileStore((s) => s.setPharmacy)
  const [hours, setHours] = useState<PharmacyBusinessHoursDay[]>([])
  const [documents, setDocuments] = useState<PharmacyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', address: '', contact_person_name: '', contact_person_phone: '' })
  const [bankForm, setBankForm] = useState({ bank_name: '', bank_account_holder_name: '', bank_account_number: '', bank_branch: '' })
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingBank, setSavingBank] = useState(false)
  const [savingHours, setSavingHours] = useState(false)
  const [logoLoading, setLogoLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const docFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const loadProfile = () => api.get('/pharmacy/profile/').then((r) => {
    const p: PharmacyProfile = r.data.data.pharmacy
    setPharmacy(p)
    setForm({
      name: p.name, phone: p.phone, address: p.address,
      contact_person_name: p.contact_person_name || '', contact_person_phone: p.contact_person_phone || '',
    })
    setBankForm({
      bank_name: p.bank_name || '', bank_account_holder_name: p.bank_account_holder_name || '',
      bank_account_number: p.bank_account_number || '', bank_branch: p.bank_branch || '',
    })
    setCoords({ lat: p.lat, lng: p.lng })
  })
  const loadHours = () => api.get('/pharmacy/profile/hours/').then((r) => setHours(r.data.data.hours || []))
  const loadDocuments = () => api.get('/pharmacy/documents/').then((r) => setDocuments(r.data.data.documents || []))

  useEffect(() => {
    Promise.all([loadProfile(), loadHours(), loadDocuments()]).catch(() => toast.error('Failed to load settings.')).finally(() => setLoading(false))
  }, [])

  const handleMapPick = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng })
    setForm((p) => ({ ...p, address: loc.address || p.address }))
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await api.patch('/pharmacy/profile/', { ...form, ...(coords || {}) })
      setPharmacy(res.data.data.pharmacy)
      toast.success('Profile updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveBank = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingBank(true)
    try {
      const res = await api.patch('/pharmacy/profile/', bankForm)
      setPharmacy(res.data.data.pharmacy)
      toast.success('Bank details updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update bank details.')
    } finally {
      setSavingBank(false)
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
      await api.post('/pharmacy/documents/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Document uploaded.')
      loadDocuments()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document.')
    } finally {
      setUploadingDoc(null)
      const input = docFileRefs.current[docType]
      if (input) input.value = ''
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) { toast.error('Only JPG, PNG, WebP, or GIF images are allowed.'); return }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3MB.'); return }

    const formData = new FormData()
    formData.append('logo', file)
    setLogoLoading(true)
    try {
      const res = await api.post('/pharmacy/profile/logo/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPharmacy(res.data.data.pharmacy)
      toast.success('Logo updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload image.')
    } finally {
      setLogoLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeLogo = async () => {
    setLogoLoading(true)
    try {
      await api.delete('/pharmacy/profile/logo/')
      if (pharmacy) setPharmacy({ ...pharmacy, logo_url: null })
      toast.success('Logo removed.')
    } catch {
      toast.error('Failed to remove logo.')
    } finally {
      setLogoLoading(false)
    }
  }

  const updateDay = (weekday: number, patch: Partial<PharmacyBusinessHoursDay>) => {
    setHours((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
  }

  const saveHours = async () => {
    setSavingHours(true)
    try {
      const res = await api.put('/pharmacy/profile/hours/', { hours })
      setHours(res.data.data.hours || [])
      toast.success('Business hours updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update hours.')
    } finally {
      setSavingHours(false)
    }
  }

  const logoSrc = resolveImg(pharmacy?.logo_url)

  if (loading) {
    return <div className="space-y-3 max-w-2xl">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
  }
  if (!pharmacy) return null

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Settings</h1>
        <p className="text-sm text-on-surface-variant mt-1">Your pharmacy's profile, availability, and hours.</p>
      </div>

      {/* Online/Offline now lives as a one-click toggle in the top nav (visible on every page) —
          this is just a status recap, not a second control, so the two can't drift out of sync. */}
      <div className={`rounded-2xl border px-5 py-3 flex items-center gap-3 ${pharmacy.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-surface-container-low border-outline-variant'}`}>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pharmacy.is_active ? 'bg-emerald-500' : 'bg-on-surface-variant'}`} />
        <p className="text-sm text-on-surface">
          You're currently <span className="font-bold">{pharmacy.is_active ? 'Online' : 'Offline'}</span> — use the toggle in the top nav to change this.
          {!pharmacy.is_verified && ' Your pharmacy is also not yet admin-verified, so no requests arrive either way until then.'}
        </p>
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <p className="text-sm font-bold text-on-surface">Profile</p>

        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '28px' }}>storefront</span>
              )}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={logoLoading}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-60">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{logoLoading ? 'progress_activity' : 'photo_camera'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleLogoChange} />
          </div>
          <div>
            <p className="text-sm font-bold text-on-surface">{pharmacy.name}</p>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${pharmacy.is_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {pharmacy.is_verified ? 'Verified' : 'Not yet verified'}
            </span>
            {logoSrc && (
              <button type="button" onClick={removeLogo} disabled={logoLoading} className="block mt-1 text-[11px] text-error hover:underline disabled:opacity-60">
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-on-surface-variant">Pharmacy Name</label>
          <input type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">License Number</label>
          <input type="text" value={pharmacy.license_number} disabled
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface-variant cursor-not-allowed" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Phone</label>
          <input type="text" required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Contact Person Name</label>
            <input type="text" value={form.contact_person_name} onChange={(e) => setForm((p) => ({ ...p, contact_person_name: e.target.value }))}
              placeholder="Who should we reach out to?"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Contact Person Phone</label>
            <input type="text" value={form.contact_person_phone} onChange={(e) => setForm((p) => ({ ...p, contact_person_phone: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-on-surface-variant">Pickup Location</label>
          <p className="text-xs text-on-surface-variant -mt-1">This is where riders come to pick up orders — pin it precisely.</p>
          <div className="h-56 rounded-xl overflow-hidden border border-outline-variant">
            <MapPicker value={coords} onChange={handleMapPick} />
          </div>
          <textarea required rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            className="w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
        </div>

        <button type="submit" disabled={savingProfile}
          className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
          {savingProfile ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Bank details — owner-only, this is where payout money actually gets sent */}
      <form onSubmit={saveBank} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <div>
          <p className="text-sm font-bold text-on-surface">Bank Details</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Where PharmaX sends your payouts.</p>
        </div>
        {pharmacy.is_owner === false ? (
          <p className="text-xs text-on-surface-variant">Only the pharmacy owner can view or change bank details.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Bank Name</label>
                <input type="text" value={bankForm.bank_name} onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Branch</label>
                <input type="text" value={bankForm.bank_branch} onChange={(e) => setBankForm((p) => ({ ...p, bank_branch: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Account Holder Name</label>
                <input type="text" value={bankForm.bank_account_holder_name} onChange={(e) => setBankForm((p) => ({ ...p, bank_account_holder_name: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Account Number</label>
                <input type="text" value={bankForm.bank_account_number} onChange={(e) => setBankForm((p) => ({ ...p, bank_account_number: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            </div>
            <button type="submit" disabled={savingBank}
              className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {savingBank ? 'Saving...' : 'Save Bank Details'}
            </button>
          </>
        )}
      </form>

      {/* Compliance documents */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <div>
          <p className="text-sm font-bold text-on-surface">Documents</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            PAN card and citizenship are uploaded by you. The MOU and cancelled cheque are uploaded by the PharmaX team.
          </p>
        </div>
        <div className="space-y-2">
          {DOC_TYPES.map((d) => {
            const doc = documents.find((x) => x.doc_type === d.type)
            return (
              <div key={d.type} className="flex items-center justify-between gap-3 bg-surface-container-low rounded-xl px-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">{d.label}</p>
                  <p className="text-xs text-on-surface-variant">{d.hint}</p>
                  {doc && <p className="text-[11px] text-emerald-600 mt-0.5">Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}{doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {doc && (
                    <a href={resolveImg(doc.file_url) || '#'} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors">
                      View
                    </a>
                  )}
                  {d.uploadedByPharmacy ? (
                    <>
                      <button type="button" onClick={() => docFileRefs.current[d.type]?.click()} disabled={uploadingDoc === d.type}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                        {uploadingDoc === d.type ? 'Uploading...' : doc ? 'Replace' : 'Upload'}
                      </button>
                      <input ref={(el) => { docFileRefs.current[d.type] = el }} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden" onChange={(e) => handleDocUpload(d.type, e)} />
                    </>
                  ) : !doc && (
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant whitespace-nowrap">
                      Pending from PharmaX
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Business hours */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <div>
          <p className="text-sm font-bold text-on-surface">Business Hours</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Informational only — this doesn't stop requests from arriving. Use the Online/Offline toggle in the top nav for that.
          </p>
        </div>
        <div className="space-y-2">
          {hours.map((day) => (
            <div key={day.weekday} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <span className="text-sm text-on-surface w-24 flex-shrink-0">{day.weekday_label}</span>
              <label className="flex items-center gap-1.5 text-xs text-on-surface-variant flex-shrink-0">
                <input type="checkbox" checked={day.is_closed} onChange={(e) => updateDay(day.weekday, { is_closed: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary" />
                Closed
              </label>
              {!day.is_closed && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input type="time" value={day.open_time || ''} onChange={(e) => updateDay(day.weekday, { open_time: e.target.value })}
                    className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
                  <span className="text-xs text-on-surface-variant">to</span>
                  <input type="time" value={day.close_time || ''} onChange={(e) => updateDay(day.weekday, { close_time: e.target.value })}
                    className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface flex-1 min-w-0 focus:outline-none focus:border-secondary" />
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={saveHours} disabled={savingHours}
          className="w-full py-3 border border-outline-variant text-on-surface text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors disabled:opacity-60">
          {savingHours ? 'Saving...' : 'Save Business Hours'}
        </button>
      </div>
    </div>
  )
}
