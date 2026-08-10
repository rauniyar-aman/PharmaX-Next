'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DeliveryFulfillment } from '@/types'

const POLL_INTERVAL_MS = 4000

// Rider dispatch now happens as soon as an order is PLACED — well before a pharmacy has
// necessarily finished packing — so this list mixes genuinely-ready jobs with still-mid-prep
// ones. A rider accepting early just means "heading to pharmacy," not "ready to grab and go."
const READY_STATUSES = new Set(['AWAITING_DELIVERY'])

export default function DeliveryRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<DeliveryFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    api.get('/delivery/requests/')
      .then((r) => setRequests(r.data.data.requests || []))
      .catch(() => { if (!silent) toast.error('Failed to load requests.') })
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const accept = async (id: string) => {
    setAcceptingId(id)
    try {
      await api.post(`/delivery/requests/${id}/accept/`)
      toast.success('Accepted! Head to the pharmacy for pickup.')
      router.push('/delivery/active')
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to accept.'
      // someone else won it first, or it expired — either way it's no longer actionable
      setRequests((prev) => prev.filter((r) => r.id !== id))
      toast.error(msg)
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Available Deliveries</h1>
        <p className="text-sm text-on-surface-variant mt-1">Pharmacy pickups near you — some still preparing, some ready now. Updates automatically.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-44 bg-surface-container-low rounded-2xl animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>local_shipping</span>
          <p className="mt-2 text-sm">No deliveries available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {requests.map((req) => {
            const ready = READY_STATUSES.has(req.status)
            return (
            <div key={req.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Pickup</p>
                  <p className="text-sm font-bold text-on-surface">{req.pharmacy_name}</p>
                  <p className="text-xs text-on-surface-variant">{req.pharmacy_address}</p>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${ready ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>{ready ? 'inventory_2' : 'hourglass_top'}</span>
                  {ready ? 'Ready now' : 'Still preparing'}
                </span>
              </div>
              <div className="text-xs text-on-surface-variant space-y-0.5">
                {req.items.map((item, i) => (
                  <p key={i}>{item.medicine_name} × {item.quantity}</p>
                ))}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>flag</span>
                Drop-off: {req.city || 'Unknown area'}
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
