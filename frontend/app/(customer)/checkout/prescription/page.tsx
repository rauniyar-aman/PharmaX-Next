'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Prescription } from '@/types'

export default function CheckoutPrescriptionPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem('checkoutAllowed') || !sessionStorage.getItem('checkoutAddress')) {
        router.replace('/checkout/shipping'); return
      }
    }
    api.get('/prescriptions/').then((r) => {
      const usable = (r.data.data.prescriptions || []).filter((p: Prescription) => p.status === 'VERIFIED' || p.status === 'PENDING')
      setPrescriptions(usable)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('checkout_draft', 'true')
    setUploading(true)
    try {
      const res = await api.post('/prescriptions/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newRx = res.data.data.prescription
      setPrescriptions((p) => [newRx, ...p])
      setSelected(newRx.id)
      toast.success('Prescription uploaded!')
    } catch {
      toast.error('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleContinue = () => {
    if (!selected) { toast.error('Please select or upload a prescription.'); return }
    sessionStorage.setItem('checkoutPrescription', selected)
    router.push('/checkout/broadcasting')
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span className="text-on-surface font-medium">1. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="font-semibold text-primary">2. Prescription</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>3. Availability</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>4. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>5. Confirm</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Upload Prescription</h1>
      <p className="text-sm text-on-surface-variant">Your cart includes Rx medicines. Select or upload a valid prescription to continue.</p>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <label key={rx.id} className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-colors ${selected === rx.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/40'}`}>
              <input type="radio" name="rx" value={rx.id} checked={selected === rx.id} onChange={() => setSelected(rx.id)} className="accent-primary" />
              <span className="material-symbols-outlined text-on-surface-variant ms-filled" style={{ fontSize: '22px' }}>description</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-on-surface">{rx.notes || 'Prescription'}</p>
                <p className="text-xs text-on-surface-variant">{new Date(rx.uploaded_at).toLocaleDateString()} · <span className={rx.status === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-600'}>{rx.status}</span></p>
              </div>
            </label>
          ))}

          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-outline-variant rounded-2xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '32px' }}>upload_file</span>
            <p className="text-sm font-medium text-on-surface mt-1">{uploading ? 'Uploading...' : 'Click to upload new prescription'}</p>
            <p className="text-xs text-on-surface-variant">JPG, PNG, PDF · Max 5MB</p>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={handleUpload} />
          </div>
        </div>
      )}

      <button onClick={handleContinue}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Continue
      </button>
    </div>
  )
}
