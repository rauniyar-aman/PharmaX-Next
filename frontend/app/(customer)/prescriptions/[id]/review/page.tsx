'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { PrescriptionMedicineItem, PrescriptionLabTestItem } from '@/types'

export default function PrescriptionReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [items, setItems] = useState<PrescriptionMedicineItem[]>([])
  const [labItems, setLabItems] = useState<PrescriptionLabTestItem[]>([])
  const [hadAnything, setHadAnything] = useState(false)
  // Frozen at load time, unlike items.length which changes as the patient removes medicines —
  // this is what decides whether the medicines section renders at all, not whatever's left.
  const [hadMedicineItems, setHadMedicineItems] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/prescriptions/${id}/medicine-items/`),
      api.get(`/prescriptions/${id}/lab-test-items/`),
    ])
      .then(([medRes, labRes]) => {
        const loadedMed = medRes.data.data.medicine_items || []
        const loadedLab = labRes.data.data.lab_test_items || []
        setItems(loadedMed)
        setLabItems(loadedLab)
        setHadMedicineItems(loadedMed.length > 0)
        setHadAnything(loadedMed.length > 0 || loadedLab.length > 0)
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load this prescription for review.'))
      .finally(() => setLoading(false))
  }, [id])

  const handleQty = (itemId: string, quantity: number) => {
    if (quantity < 1) return
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)))
  }

  const handleRemove = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  const subtotal = items.reduce((s, i) => s + Number(i.medicine.price) * i.quantity, 0)

  const handleSubmit = async () => {
    if (items.length === 0) return
    setSubmitting(true)
    try {
      const res = await api.post(`/prescriptions/${id}/medicine-items/confirm/`, {
        items: items.map((i) => ({ medicine_item_id: i.id, quantity: i.quantity })),
      })
      const skipped = res.data.data?.skipped || []
      if (skipped.length > 0) {
        const reasons = skipped.map((s: any) => s.reason).join(' ')
        toast.error(`Some items couldn't be added: ${reasons}`, { duration: 6000 })
      } else {
        toast.success('Added to your cart!')
      }
      router.push('/cart')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add these medicines to your cart.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="text-center py-24 space-y-4">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>error</span>
      <h2 className="text-xl font-bold text-on-surface">Can't review this prescription</h2>
      <p className="text-sm text-on-surface-variant">{loadError}</p>
      <Link href="/prescriptions" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
        Back to Prescriptions
      </Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Review Your Consultation</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {hadMedicineItems && labItems.length > 0
            ? 'Medicines matched to your prescription and lab tests suggested for you — review both below.'
            : hadMedicineItems
            ? 'Medicines matched to your prescription. Adjust quantities or remove anything you don\'t need, then add them to your cart.'
            : 'Lab tests suggested for you — book each one whenever suits you.'}
        </p>
      </div>

      {!hadAnything ? (
        <div className="text-center py-24 space-y-4">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>remove_shopping_cart</span>
          <h2 className="text-xl font-bold text-on-surface">Nothing to review</h2>
          <p className="text-sm text-on-surface-variant">No medicines or lab tests were attached to this prescription.</p>
          <Link href="/prescriptions" className="inline-block mt-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity">
            Back to Prescriptions
          </Link>
        </div>
      ) : (
        <>
        {hadMedicineItems && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {items.length === 0 && (
              <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '40px' }}>remove_shopping_cart</span>
                <p className="text-sm font-medium text-on-surface mt-3">You've removed every medicine from this review</p>
                <p className="text-xs text-on-surface-variant mt-1">There's nothing left to add to your cart.</p>
              </div>
            )}
            {items.map((item) => (
              <div key={item.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex gap-4">
                {item.medicine.image_url ? (
                  <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name} className="w-20 h-20 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-20 h-20 bg-surface-container-low rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '32px' }}>medication</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.medicine.type === 'Rx' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                        {item.medicine.type}
                      </span>
                      <p className="text-sm font-semibold text-on-surface mt-1 leading-snug">{item.medicine.name}</p>
                      <p className="text-xs text-on-surface-variant">{item.medicine.brand_name}</p>
                    </div>
                    <button onClick={() => handleRemove(item.id)} className="text-error hover:bg-error/10 rounded-lg p-1 transition-colors flex-shrink-0">
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-0 border border-outline-variant rounded-xl overflow-hidden">
                      <button onClick={() => handleQty(item.id, item.quantity - 1)} disabled={item.quantity <= 1}
                        className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-on-surface">{item.quantity}</span>
                      <button onClick={() => handleQty(item.id, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                      </button>
                    </div>
                    <span className="font-bold text-on-surface">NPR {(Number(item.medicine.price) * item.quantity).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
              <h2 className="font-bold text-on-surface text-base">Summary</h2>
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
                <span className="text-on-surface font-medium">NPR {subtotal.toFixed(0)}</span>
              </div>
              <button onClick={handleSubmit} disabled={submitting || items.length === 0}
                className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                {submitting ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Adding...</> : 'Add to Cart'}
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Separate section from the medicine list — each suggested test routes into the real,
            existing lab test booking flow rather than a bulk confirm like medicines get, since a
            lab test needs its own address/date/time chosen at booking time. */}
        {labItems.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-on-surface">Suggested Lab Tests</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {labItems.map((item) => (
                <div key={item.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{item.lab_test.name}</p>
                    <p className="text-xs text-on-surface-variant">{item.lab_test.category_name} · NPR {Number(item.lab_test.price).toFixed(0)}</p>
                  </div>
                  {item.booking_id ? (
                    <span className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap flex-shrink-0">
                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>check_circle</span>
                      Booked
                    </span>
                  ) : (
                    <Link href={`/lab-tests/${item.lab_test.id}?prescription_lab_test_item_id=${item.id}`}
                      className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-full hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0">
                      Book This Test
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
