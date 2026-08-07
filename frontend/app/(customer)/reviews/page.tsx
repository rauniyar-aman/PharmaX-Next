'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { Review, Medicine, DoctorReview } from '@/types'

type MyReview = Review & { medicine: Medicine }

const TABS = ['Medicines', 'Doctors'] as const
type Tab = typeof TABS[number]

export default function MyReviewsPage() {
  const [tab, setTab] = useState<Tab>('Medicines')
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-on-surface">My Reviews</h1>
      <div className="flex items-center gap-1 border-b border-outline-variant">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Medicines' ? <MedicineReviewsTab /> : <DoctorReviewsTab />}
    </div>
  )
}

function MedicineReviewsTab() {
  const [reviews, setReviews] = useState<MyReview[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/medicines/my-reviews/').then((r) => setReviews(r.data.data.reviews || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (rev: MyReview) => {
    setDeletingId(rev.id)
    try {
      await api.delete(`/medicines/${rev.medicine.id}/reviews/`)
      setReviews((p) => p.filter((r) => r.id !== rev.id))
      toast.success('Review deleted.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete review.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!reviews.length) return (
    <div className="text-center py-24 space-y-3">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>rate_review</span>
      <h2 className="text-xl font-bold text-on-surface">No reviews yet</h2>
      <p className="text-sm text-on-surface-variant">Reviews you write will appear here</p>
      <Link href="/orders" className="inline-block mt-2 text-sm text-primary hover:underline">View your orders</Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {reviews.map((rev) => (
        <div key={rev.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex gap-4">
          {rev.medicine?.image_url ? (
            <img src={resolveImg(rev.medicine.image_url) || undefined} alt={rev.medicine.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '24px' }}>medication</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {rev.medicine && (
                <Link href={`/medicines/${rev.medicine.id}`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                  {rev.medicine.name}
                </Link>
              )}
              <button onClick={() => handleDelete(rev)} disabled={deletingId === rev.id}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-error/10 hover:text-error transition-colors text-on-surface-variant disabled:opacity-50">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{deletingId === rev.id ? 'progress_activity' : 'delete'}</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 mt-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`material-symbols-outlined ${i < rev.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
              ))}
              <span className="text-xs text-on-surface-variant ml-1">{new Date(rev.created_at).toLocaleDateString()}</span>
            </div>
            {rev.comment && <p className="text-sm text-on-surface-variant mt-1">{rev.comment}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function DoctorReviewsTab() {
  const [reviews, setReviews] = useState<DoctorReview[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/doctors/my-reviews/').then((r) => setReviews(r.data.data.reviews || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (rev: DoctorReview) => {
    if (!rev.doctor) return
    setDeletingId(rev.id)
    try {
      await api.delete(`/doctors/${rev.doctor.id}/reviews/`)
      setReviews((p) => p.filter((r) => r.id !== rev.id))
      toast.success('Review deleted.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete review.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!reviews.length) return (
    <div className="text-center py-24 space-y-3">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>rate_review</span>
      <h2 className="text-xl font-bold text-on-surface">No doctor reviews yet</h2>
      <p className="text-sm text-on-surface-variant">Reviews you write for doctors will appear here</p>
      <Link href="/appointments" className="inline-block mt-2 text-sm text-primary hover:underline">View your appointments</Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {reviews.map((rev) => (
        <div key={rev.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex gap-4">
          <div className="w-14 h-14 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
            {rev.doctor?.photo_url ? (
              <img src={resolveImg(rev.doctor.photo_url) || undefined} alt={rev.doctor.name} className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>stethoscope</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {rev.doctor && (
                <Link href={`/doctor-consult/${rev.doctor.id}`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                  Dr. {rev.doctor.name}
                </Link>
              )}
              <button onClick={() => handleDelete(rev)} disabled={deletingId === rev.id}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-error/10 hover:text-error transition-colors text-on-surface-variant disabled:opacity-50">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{deletingId === rev.id ? 'progress_activity' : 'delete'}</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5 mt-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className={`material-symbols-outlined ${i < rev.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
              ))}
              <span className="text-xs text-on-surface-variant ml-1">{new Date(rev.created_at).toLocaleDateString()}</span>
            </div>
            {rev.comment && <p className="text-sm text-on-surface-variant mt-1">{rev.comment}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
