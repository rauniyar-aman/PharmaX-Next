'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import { useAuthStore } from '@/store/auth'
import type { Doctor, DoctorReview } from '@/types'

function tomorrowDateStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(tomorrowDateStr())
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [timeSlot, setTimeSlot] = useState('')
  const [reason, setReason] = useState('')
  const [booking, setBooking] = useState(false)
  const [tab, setTab] = useState<'about' | 'reviews'>('about')

  const [reviews, setReviews] = useState<DoctorReview[]>([])
  const [canReview, setCanReview] = useState(false)
  const [myRating, setMyRating] = useState(5)
  const [myReview, setMyReview] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [deletingReview, setDeletingReview] = useState(false)
  const myExistingReview = reviews.find((r) => r.is_mine)

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get(`/doctors/${id}/`),
      api.get(`/doctors/${id}/reviews/`),
    ]).then(([docRes, revRes]) => {
      setDoctor(docRes.data.data.doctor)
      const revs: DoctorReview[] = revRes.data.data.reviews || []
      setReviews(revs)
      setCanReview(Boolean(revRes.data.data.can_review))
      const mine = revs.find((r) => r.is_mine)
      if (mine) { setMyRating(mine.rating); setMyReview(mine.comment || '') }
    }).catch(() => toast.error('Doctor not found.')).finally(() => setLoading(false))
  }, [id])

  // Real available slots, computed server-side from the doctor's weekly availability pattern —
  // refetched every time the date changes so the list never goes stale mid-booking.
  useEffect(() => {
    if (!id || !date) return
    setSlotsLoading(true)
    setTimeSlot('')
    api.get(`/doctors/${id}/slots/`, { params: { date } })
      .then((r) => setSlots(r.data.data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [id, date])

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { router.push('/signin'); return }
    setReviewLoading(true)
    try {
      if (myExistingReview) {
        await api.put(`/doctors/${id}/reviews/`, { rating: myRating, comment: myReview })
        toast.success('Review updated!')
      } else {
        await api.post(`/doctors/${id}/reviews/`, { rating: myRating, comment: myReview })
        toast.success('Review submitted!')
      }
      const r = await api.get(`/doctors/${id}/reviews/`)
      setReviews(r.data.data.reviews || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not submit review.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleReviewDelete = async () => {
    setDeletingReview(true)
    try {
      await api.delete(`/doctors/${id}/reviews/`)
      toast.success('Review deleted.')
      setMyRating(5)
      setMyReview('')
      const r = await api.get(`/doctors/${id}/reviews/`)
      setReviews(r.data.data.reviews || [])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not delete review.')
    } finally {
      setDeletingReview(false)
    }
  }

  const handleBook = async () => {
    if (!user) { router.push('/signin'); return }
    if (!timeSlot) { toast.error('Please select a time slot.'); return }
    setBooking(true)
    try {
      const res = await api.post('/doctors/appointments/', {
        doctor_id: id, scheduled_date: date, time_slot: timeSlot, reason: reason || undefined,
      })
      const appt = res.data.data.appointment
      // Two genuinely distinct outcomes: a Plus member's booking is already CONFIRMED with
      // nothing left to pay, while everyone else still owes the consultation fee and has to go
      // through the Khalti step before their appointment is confirmed.
      if (appt.is_plus_free) {
        toast.success('Appointment confirmed — it\'s free with your PharmaX Plus membership!')
        router.push('/appointments')
      } else {
        toast.success('Appointment booked — complete payment to confirm it.')
        router.push(`/appointments/${appt.id}/payment`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not book this appointment.')
    } finally {
      setBooking(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!doctor) return (
    <div className="text-center py-24">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '56px' }}>stethoscope</span>
      <p className="text-base font-medium text-on-surface mt-3">Doctor not found</p>
      <Link href="/doctor-consult" className="inline-block mt-4 text-sm text-primary hover:underline">Back to Doctor Consult</Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/doctor-consult" className="hover:text-primary transition-colors">Doctor Consult</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Dr. {doctor.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-surface rounded-2xl border border-outline-variant p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full bg-secondary/10 text-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                {doctor.photo_url ? (
                  <img src={resolveImg(doctor.photo_url) || undefined} alt={doctor.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '36px' }}>stethoscope</span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-on-surface leading-tight">Dr. {doctor.name}</h1>
                <p className="text-sm text-primary font-semibold mt-0.5">{doctor.specialty}</p>
                {doctor.qualification && <p className="text-xs text-on-surface-variant mt-0.5">{doctor.qualification}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>work</span>{doctor.experience_years}+ years experience</span>
              {doctor.languages && <span className="flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>translate</span>{doctor.languages}</span>}
              <span className="flex items-center gap-1.5"><span className="material-symbols-outlined ms-filled text-amber-500" style={{ fontSize: '18px' }}>star</span>{Number(doctor.rating).toFixed(1)} ({doctor.total_reviews} reviews)</span>
            </div>

          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
            <div className="flex border-b border-outline-variant">
              {(['about', 'reviews'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
                  {t === 'about' ? 'About' : `Reviews (${reviews.length})`}
                </button>
              ))}
            </div>
            <div className="p-5">
              {tab === 'about' ? (
                doctor.bio ? (
                  <p className="text-sm text-on-surface-variant leading-relaxed">{doctor.bio}</p>
                ) : (
                  <p className="text-sm text-on-surface-variant text-center py-6">No bio available.</p>
                )
              ) : (
                <div className="space-y-5">
                  {user && !canReview && !myExistingReview && (
                    <div className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-3">
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '22px' }}>lock</span>
                      <p className="text-sm text-on-surface-variant">
                        Complete a consultation with Dr. {doctor.name} to leave a review.
                      </p>
                    </div>
                  )}
                  {user && (canReview || myExistingReview) && (
                    <form onSubmit={handleReviewSubmit} className="bg-surface-container-low rounded-2xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-on-surface">{myExistingReview ? 'Edit Your Review' : 'Write a Review'}</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} type="button" onClick={() => setMyRating(n)}>
                            <span className={`material-symbols-outlined ${n <= myRating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '22px' }}>star</span>
                          </button>
                        ))}
                      </div>
                      <textarea value={myReview} onChange={(e) => setMyReview(e.target.value)} rows={3}
                        placeholder="Share your experience with this doctor..."
                        className="w-full px-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                      <div className="flex items-center gap-2">
                        <button type="submit" disabled={reviewLoading || !myReview.trim()}
                          className="px-5 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                          {reviewLoading ? 'Saving...' : myExistingReview ? 'Update Review' : 'Submit Review'}
                        </button>
                        {myExistingReview && (
                          <button type="button" onClick={handleReviewDelete} disabled={deletingReview}
                            className="px-5 py-2 border border-error/30 text-error text-sm font-semibold rounded-xl hover:bg-error/10 transition-colors disabled:opacity-60">
                            {deletingReview ? 'Deleting...' : 'Delete Review'}
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                  {reviews.length === 0 ? (
                    <p className="text-sm text-on-surface-variant text-center py-6">No reviews yet. Be the first to review!</p>
                  ) : (
                    <div className="space-y-3">
                      {reviews.map((rev) => (
                        <div key={rev.id} className={`border rounded-2xl p-4 space-y-2 ${rev.is_mine ? 'border-primary/40 bg-primary/[0.03]' : 'border-outline-variant'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{rev.user?.full_name?.[0] || 'U'}</span>
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-on-surface">{rev.user?.full_name || 'User'}</p>
                                <p className="text-xs text-on-surface-variant">{new Date(rev.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              {[...Array(5)].map((_, i) => (
                                <span key={i} className={`material-symbols-outlined ${i < rev.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
                              ))}
                            </div>
                          </div>
                          {rev.comment && <p className="text-sm text-on-surface-variant">{rev.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4 sticky top-[7.5rem]">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-on-surface">NPR {Number(doctor.consultation_fee).toFixed(0)}</span>
              <span className="text-xs text-on-surface-variant">consultation fee</span>
            </div>

            {user ? (
              <>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Preferred Date</label>
                  <input type="date" min={tomorrowDateStr()} value={date} onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Available Time Slots</label>
                  {slotsLoading ? (
                    <div className="mt-1 grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-surface-container-low rounded-lg animate-pulse" />)}</div>
                  ) : slots.length === 0 ? (
                    <p className="mt-1 text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2.5">
                      No slots available on this date — try another day.
                    </p>
                  ) : (
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      {slots.map((s) => (
                        <button key={s} type="button" onClick={() => setTimeSlot(s)}
                          className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${timeSlot === s ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-on-surface-variant">Reason for visit (optional)</label>
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary transition" />
                </div>
                <button onClick={handleBook} disabled={booking}
                  className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {booking ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Booking...</> : 'Book Appointment'}
                </button>
                <p className="text-[11px] text-on-surface-variant text-center">Online consultation — meeting link will be shared after confirmation.</p>
              </>
            ) : (
              <button onClick={() => router.push('/signin')}
                className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
                Sign In to Book
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
