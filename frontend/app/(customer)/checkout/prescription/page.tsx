'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useCart } from '@/hooks/useCart'
import { resolveImg } from '@/lib/resolveImg'
import type { Prescription } from '@/types'

interface RxLine {
  medicineId: string
  name: string
}

export default function CheckoutPrescriptionPage() {
  const router = useRouter()
  const { cart } = useCart()
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [rxLines, setRxLines] = useState<RxLine[] | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!sessionStorage.getItem('checkoutAllowed')) {
      router.replace('/cart')
    }
  }, [])

  // Buy Now bypasses the cart, so its own item list (not the cart's) determines which
  // medicines need a prescription here — see the medicine detail page's handleBuyNow().
  useEffect(() => {
    const buyNowRaw = sessionStorage.getItem('checkoutBuyNowItems')
    if (buyNowRaw) {
      try {
        const items = (JSON.parse(buyNowRaw) as any[]).filter((i) => i.is_rx)
        Promise.all(
          items.map((i) =>
            api.get(`/medicines/${i.medicine_id}/`).then((r) => ({ medicineId: i.medicine_id, name: r.data.data.medicine.name }))
          )
        ).then(setRxLines).catch(() => setRxLines([]))
      } catch {
        setRxLines([])
      }
      return
    }
    if (!cart) return
    setRxLines(
      cart.items
        .filter((i) => i.medicine.type === 'Rx')
        .map((i) => ({ medicineId: i.medicine.id, name: i.medicine.name }))
    )
  }, [cart])

  useEffect(() => {
    api.get('/prescriptions/').then((r) => {
      const usable = (r.data.data.prescriptions || []).filter((p: Prescription) => p.status === 'VERIFIED' || p.status === 'PENDING')
      setPrescriptions(usable)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleUpload = async (medicineId: string, files: FileList) => {
    if (files.length === 0) return
    if (files.length > 10) { toast.error('You can upload up to 10 pages at once.'); return }
    const formData = new FormData()
    Array.from(files).forEach((f) => formData.append('files', f))
    formData.append('checkout_draft', 'true')
    // Multiple files here are pages of the SAME prescription (e.g. a multi-page scan), not
    // separate prescriptions — group them into one Prescription with attached extra pages.
    formData.append('group_as_one', 'true')
    setUploadingFor(medicineId)
    try {
      const res = await api.post('/prescriptions/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      const newRx = res.data.data.prescription
      setPrescriptions((p) => [newRx, ...p])
      setSelections((s) => ({ ...s, [medicineId]: newRx.id }))
      toast.success(files.length > 1 ? `Prescription uploaded (${files.length} pages)!` : 'Prescription uploaded!')
    } catch {
      toast.error('Upload failed.')
    } finally {
      setUploadingFor(null)
    }
  }

  const handleContinue = () => {
    if (!rxLines) return
    const missing = rxLines.filter((l) => !selections[l.medicineId])
    if (missing.length > 0) {
      toast.error(`Please select or upload a prescription for ${missing.map((m) => m.name).join(', ')}.`)
      return
    }
    sessionStorage.setItem('checkoutItemPrescriptions', JSON.stringify(selections))
    router.push('/checkout/shipping')
  }

  const busy = loading || rxLines === null

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span className="font-semibold text-primary">1. Prescription</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>2. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>3. Availability</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>4. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>5. Confirm</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Attach Prescriptions</h1>
      <p className="text-sm text-on-surface-variant">
        Your order includes prescription-required medicines. Select or upload a valid prescription for each one below.
      </p>

      {busy ? (
        <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {rxLines!.map((line) => (
            <div key={line.medicineId} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '18px' }}>medication</span>
                <p className="text-sm font-bold text-on-surface">{line.name}</p>
              </div>

              <div className="space-y-2 pl-1">
                {prescriptions.map((rx) => {
                  const files = rx.all_files && rx.all_files.length > 0
                    ? rx.all_files
                    : rx.file_url ? [{ id: null, file_name: rx.file_name || 'Prescription', file_url: rx.file_url }] : []
                  return (
                    <label key={rx.id} className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${selections[line.medicineId] === rx.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/40'}`}>
                      <input type="radio" name={`rx-${line.medicineId}`} value={rx.id} checked={selections[line.medicineId] === rx.id}
                        onChange={() => setSelections((s) => ({ ...s, [line.medicineId]: rx.id }))} className="accent-primary" />
                      <span className="material-symbols-outlined text-on-surface-variant ms-filled" style={{ fontSize: '20px' }}>description</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{rx.file_name || rx.notes || 'Prescription'}</p>
                        <p className="text-xs text-on-surface-variant">
                          {new Date(rx.uploaded_at).toLocaleDateString()} · <span className={rx.status === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-600'}>{rx.status}</span>
                          {files.length > 1 && <> · {files.length} pages</>}
                        </p>
                      </div>
                      {files.length > 0 && (
                        <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {files.map((f, i) => (
                            <a key={f.id ?? 'primary'} href={resolveImg(f.file_url) || undefined} target="_blank" rel="noopener noreferrer"
                              title={f.file_name}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                              {files.length > 1 ? `Page ${i + 1}` : 'View'}
                              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </label>
                  )
                })}

                <div onClick={() => fileRefs.current[line.medicineId]?.click()}
                  className="border-2 border-dashed border-outline-variant rounded-2xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '26px' }}>upload_file</span>
                  <p className="text-xs font-medium text-on-surface mt-1">{uploadingFor === line.medicineId ? 'Uploading...' : 'Click to upload new prescription'}</p>
                  <p className="text-[11px] text-on-surface-variant">JPG, PNG, PDF · Max 5MB each · Select multiple pages at once</p>
                  <input ref={(el) => { fileRefs.current[line.medicineId] = el }} type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                    onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleUpload(line.medicineId, e.target.files) }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={handleContinue} disabled={busy}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Continue
      </button>
    </div>
  )
}
