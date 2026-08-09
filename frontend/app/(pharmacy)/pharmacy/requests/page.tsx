'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { usePharmacyRequestsStore } from '@/store/pharmacyRequests'

export default function PharmacyRequestsPage() {
  const requests = usePharmacyRequestsStore((s) => s.requests)
  const loading = usePharmacyRequestsStore((s) => s.loading)
  const removeRequest = usePharmacyRequestsStore((s) => s.removeRequest)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setRespondingId(id)
    try {
      await api.post(`/pharmacy/requests/${id}/${action}/`)
      removeRequest(id)
      toast.success(action === 'accept' ? 'Accepted! Check Orders for pickup details.' : 'Declined.')
    } catch (err: any) {
      const msg = err.response?.data?.message || `Failed to ${action}.`
      // the request expired or someone else on this pharmacy's team already responded — either
      // way it's no longer actionable, so drop it from the list rather than leaving a dead button.
      removeRequest(id)
      toast.error(msg)
    } finally {
      setRespondingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Incoming Requests</h1>
        <p className="text-sm text-on-surface-variant mt-1">Orders nearby customers placed that you can fulfill. Updates automatically.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-surface-container-low rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>inbox</span>
          <p className="mt-2 text-sm">No incoming requests right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {requests.map((req) => (
            <div key={req.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-on-surface">{req.medicine_name}</p>
                <p className="text-xs text-on-surface-variant">Qty: {req.quantity}</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>location_on</span>
                {req.city || 'Unknown area'}{req.province ? `, ${req.province}` : ''}
              </div>
              <div className="flex gap-2">
                <button onClick={() => respond(req.id, 'accept')} disabled={respondingId === req.id}
                  className="flex-1 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                  Accept
                </button>
                <button onClick={() => respond(req.id, 'decline')} disabled={respondingId === req.id}
                  className="flex-1 py-2 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-xl hover:bg-surface-container transition-colors disabled:opacity-60">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
