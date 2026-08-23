'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useLabCollectorRequestsStore } from '@/store/labCollectorRequests'

export default function LabCollectorRequestsPage() {
  const router = useRouter()
  // Reads from the shared store (polling started once in (lab-collector)/layout.tsx, so it keeps
  // running even when the collector navigates to Active) instead of running its own separate poll.
  const requests = useLabCollectorRequestsStore((s) => s.requests)
  const loading = useLabCollectorRequestsStore((s) => s.loading)
  const removeRequest = useLabCollectorRequestsStore((s) => s.removeRequest)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  const accept = async (id: string) => {
    setAcceptingId(id)
    try {
      await api.post(`/lab-collector/requests/${id}/accept/`)
      toast.success('Accepted! Head to the patient\'s address for collection.')
      router.push('/lab-collector/active')
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to accept.'
      // someone else won it first, or it's no longer eligible — either way it's no longer actionable
      removeRequest(id)
      toast.error(msg)
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Available Collections</h1>
        <p className="text-sm text-on-surface-variant mt-1">Sample collections near you. Updates automatically.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-surface-container-low rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>science</span>
          <p className="mt-2 text-sm">No collections available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {requests.map((req) => {
            const isCod = req.payment_method === 'CASH_ON_DELIVERY'
            return (
              <div key={req.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Collection</p>
                    <p className="text-sm font-bold text-on-surface">{req.lab_test.name}</p>
                    <p className="text-xs text-on-surface-variant">{req.user?.full_name}</p>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${isCod ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>{isCod ? 'payments' : 'check_circle'}</span>
                    {isCod ? 'Collect Cash' : 'Already Paid'}
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant space-y-0.5">
                  <p className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>calendar_month</span>
                    {req.scheduled_date} · {req.time_slot}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>flag</span>
                    {req.address?.city || 'Unknown area'}
                  </p>
                </div>
                <button onClick={() => accept(req.id)} disabled={acceptingId === req.id}
                  className="w-full py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  Accept
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
