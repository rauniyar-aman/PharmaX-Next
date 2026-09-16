'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Doctor, DoctorProfileChangeRequest, DoctorDocument } from '@/types'

// Client-side mirror of the backend limits (DoctorProfileChangeRequestView / DoctorDocumentView).
// The server validates authoritatively; these just give faster feedback.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024

type SocialLink = { label: string; url: string }

function statusChip(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  if (status === 'APPROVED') return { cls: 'bg-emerald-50 text-emerald-600', label: 'Approved' }
  if (status === 'REJECTED') return { cls: 'bg-error/10 text-error', label: 'Rejected' }
  return { cls: 'bg-amber-50 text-amber-600', label: 'Pending review' }
}

export default function DoctorProfilePage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [changeRequest, setChangeRequest] = useState<DoctorProfileChangeRequest | null>(null)
  const [documents, setDocuments] = useState<DoctorDocument[]>([])
  const [loading, setLoading] = useState(true)

  // Profile-edit form
  const [bio, setBio] = useState('')
  const [qualification, setQualification] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [languages, setLanguages] = useState('')
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  // Research documents
  const [docTitle, setDocTitle] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // When a change request is still pending, the live Doctor row hasn't been updated yet — so we
  // prefill the form with the *requested* values (what's under review) rather than the stale live
  // ones, and lock editing until it's resolved. Otherwise we prefill from the live values.
  const isPending = changeRequest?.status === 'PENDING'

  useEffect(() => {
    api.get('/doctor/profile/').then((r) => {
      const d: Doctor = r.data.data.doctor
      const cr: DoctorProfileChangeRequest | null = r.data.data.profile_change_request
      setDoctor(d)
      setChangeRequest(cr)
      setDocuments(r.data.data.documents || [])

      const pending = cr?.status === 'PENDING'
      setBio((pending ? cr?.requested_bio : d.bio) || '')
      setQualification((pending ? cr?.requested_qualification : d.qualification) || '')
      const exp = pending ? cr?.requested_experience_years : d.experience_years
      setExperienceYears(exp == null ? '' : String(exp))
      setLanguages((pending ? cr?.requested_languages : d.languages) || '')
      setSocialLinks((pending ? cr?.requested_social_links : d.social_links) || [])
      setPhotoPreview(resolveImg((pending ? cr?.requested_photo_url : d.photo_url) || null))
    }).catch(() => toast.error('Failed to load your profile.')).finally(() => setLoading(false))
  }, [])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { toast.error('Photo must be a JPG, PNG, or WebP image.'); return }
    if (file.size > MAX_SIZE) { toast.error('Photo must be under 5MB.'); return }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const updateLink = (i: number, patch: Partial<SocialLink>) =>
    setSocialLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const removeLink = (i: number) => setSocialLinks((prev) => prev.filter((_, idx) => idx !== i))
  const addLink = () => setSocialLinks((prev) => (prev.length >= 10 ? prev : [...prev, { label: '', url: '' }]))

  const submitChanges = async (e: React.FormEvent) => {
    e.preventDefault()
    // Drop blank rows; both fields must be present on the ones we keep.
    const cleaned = socialLinks
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url)
    for (const l of cleaned) {
      if (!l.label || !l.url) { toast.error('Each link needs both a label and a URL.'); return }
      if (!/^https?:\/\//i.test(l.url)) { toast.error(`Link "${l.label}" must start with http:// or https://.`); return }
    }

    const fd = new FormData()
    fd.append('bio', bio)
    fd.append('qualification', qualification)
    fd.append('experience_years', experienceYears)
    fd.append('languages', languages)
    fd.append('social_links', JSON.stringify(cleaned))
    if (photoFile) fd.append('photo', photoFile)

    setSubmitting(true)
    try {
      const res = await api.post('/doctor/profile/change-request/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setChangeRequest(res.data.data.profile_change_request)
      setPhotoFile(null)
      setSocialLinks(cleaned)
      toast.success('Changes submitted — an admin will review them shortly.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to submit changes.')
    } finally {
      setSubmitting(false)
    }
  }

  const uploadDoc = async () => {
    if (!docTitle.trim()) { toast.error('Give the document a title first.'); return }
    if (!docFile) { toast.error('Choose a file to upload.'); return }
    if (!DOC_TYPES.includes(docFile.type)) { toast.error('Only JPG, PNG, WebP, or PDF files are allowed.'); return }
    if (docFile.size > MAX_SIZE) { toast.error('File must be under 5MB.'); return }

    const fd = new FormData()
    fd.append('title', docTitle.trim())
    fd.append('file', docFile)
    setUploadingDoc(true)
    try {
      const res = await api.post('/doctor/documents/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setDocuments((prev) => [res.data.data.document, ...prev])
      setDocTitle('')
      setDocFile(null)
      if (docRef.current) docRef.current.value = ''
      toast.success('Document uploaded — an admin will review it shortly.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document.')
    } finally {
      setUploadingDoc(false)
    }
  }

  const deleteDoc = async (docId: string) => {
    setDeletingDocId(docId)
    try {
      await api.delete(`/doctor/documents/${docId}/`)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      toast.success('Document removed.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove document.')
    } finally {
      setDeletingDocId(null)
    }
  }

  if (loading) {
    return <div className="space-y-3 max-w-2xl">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
  }
  if (!doctor) return null

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Profile</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Keep your public profile up to date. Every change is reviewed by an admin before it goes live.
        </p>
      </div>

      {/* Admin-managed identity — shown for context, not editable here */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-on-surface">Dr. {doctor.name}</p>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${doctor.is_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {doctor.is_verified ? 'Verified' : 'Not yet verified'}
          </span>
        </div>
        <p className="text-xs text-on-surface-variant">{doctor.specialty} · NPR {Number(doctor.consultation_fee).toFixed(0)} / consult</p>
        <p className="text-xs text-on-surface-variant">
          Your name, specialty, consultation fee and license are managed by the Swasthaya team — reach out if any of them need to change.
        </p>
      </div>

      {/* Change-request status banner */}
      {isPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-amber-600" style={{ fontSize: '20px' }}>hourglass_top</span>
          <p className="text-sm text-amber-800">
            Your profile changes are pending admin review — submitted {new Date(changeRequest!.created_at).toLocaleDateString()}. You'll be able to edit again once they're reviewed.
          </p>
        </div>
      )}
      {changeRequest?.status === 'APPROVED' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-emerald-600" style={{ fontSize: '20px' }}>check_circle</span>
          <p className="text-sm text-emerald-800">
            Your last profile changes were approved{changeRequest.reviewed_at ? ` on ${new Date(changeRequest.reviewed_at).toLocaleDateString()}` : ''} and are now live.
          </p>
        </div>
      )}
      {changeRequest?.status === 'REJECTED' && (
        <div className="bg-error/5 border border-error/20 rounded-2xl px-5 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined ms-filled text-error mt-0.5" style={{ fontSize: '20px' }}>cancel</span>
          <p className="text-sm text-error">
            Your last profile changes were rejected: {changeRequest.admin_note || 'No reason given.'} Edit and resubmit below.
          </p>
        </div>
      )}

      {/* Editable profile */}
      <form onSubmit={submitChanges} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <p className="text-sm font-bold text-on-surface">Public Profile</p>

        {/* Photo */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '28px' }}>stethoscope</span>
            )}
          </div>
          <div>
            <button type="button" onClick={() => photoRef.current?.click()} disabled={isPending}
              className="px-3 py-1.5 border border-outline-variant text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors disabled:opacity-60">
              {photoFile ? 'Change photo' : 'Upload photo'}
            </button>
            <p className="text-[11px] text-on-surface-variant mt-1">JPG, PNG or WebP, up to 5MB.</p>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} disabled={isPending} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-on-surface-variant">Qualification</label>
          <input type="text" value={qualification} onChange={(e) => setQualification(e.target.value)} disabled={isPending}
            placeholder="e.g. MBBS, MD (Internal Medicine)"
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition disabled:opacity-60" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Years of experience</label>
            <input type="number" min="0" max="80" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} disabled={isPending}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition disabled:opacity-60" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Languages</label>
            <input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} disabled={isPending}
              placeholder="e.g. English, Nepali, Hindi"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition disabled:opacity-60" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-on-surface-variant">Bio</label>
          <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} disabled={isPending}
            placeholder="Tell patients about your background, focus areas and approach."
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition disabled:opacity-60" />
        </div>

        {/* Social / website links */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-on-surface-variant">Links</label>
          <p className="text-xs text-on-surface-variant -mt-1">Website, LinkedIn, ResearchGate — anything you'd like patients to see. Up to 10.</p>
          {socialLinks.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} disabled={isPending}
                placeholder="Label"
                className="w-1/3 px-3 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition disabled:opacity-60" />
              <input type="url" value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} disabled={isPending}
                placeholder="https://..."
                className="flex-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition disabled:opacity-60" />
              <button type="button" onClick={() => removeLink(i)} disabled={isPending}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-error-container hover:text-error transition-colors disabled:opacity-60" title="Remove link">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            </div>
          ))}
          {!isPending && socialLinks.length < 10 && (
            <button type="button" onClick={addLink}
              className="w-full py-2 border-2 border-dashed border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
              Add link
            </button>
          )}
        </div>

        <button type="submit" disabled={submitting || isPending}
          className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
          {isPending ? 'Changes pending review' : submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>

      {/* Research / credential documents */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <div>
          <p className="text-sm font-bold text-on-surface">Research & Credentials</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Upload research papers or credential documents. Each is reviewed by an admin, and only approved documents appear on your public profile.
          </p>
        </div>

        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc) => {
              const chip = statusChip(doc.status)
              const src = resolveImg(doc.file_url)
              return (
                <div key={doc.id} className="bg-surface-container-low rounded-xl px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant flex-shrink-0" style={{ fontSize: '20px' }}>description</span>
                      <p className="text-sm font-medium text-on-surface truncate">{doc.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                      {src && (
                        <a href={src} target="_blank" rel="noopener noreferrer"
                          className="px-2.5 py-1 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors">
                          View
                        </a>
                      )}
                      <button type="button" onClick={() => deleteDoc(doc.id)} disabled={deletingDocId === doc.id}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:bg-error-container hover:text-error transition-colors disabled:opacity-60" title="Remove document">
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                      </button>
                    </div>
                  </div>
                  {doc.status === 'REJECTED' && doc.admin_note && (
                    <p className="text-[11px] text-error pl-7">Rejected: {doc.admin_note}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-surface-container-low rounded-xl p-3 space-y-2.5 border border-outline-variant">
          <p className="text-xs font-semibold text-on-surface">Add a document</p>
          <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Title — e.g. Journal of Cardiology, 2024"
            className="w-full px-3 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
          <input ref={docRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-on-surface-variant file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-container file:text-on-surface hover:file:bg-surface-container-high file:cursor-pointer" />
          <button type="button" onClick={uploadDoc} disabled={uploadingDoc}
            className="w-full py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
            {uploadingDoc ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      </div>
    </div>
  )
}
