'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { DeliveryActiveFulfillment } from '@/types'

type LocationStatus = 'idle' | 'requesting' | 'sharing' | 'denied' | 'unsupported'

export default function DeliveryActivePage() {
  const [deliveries, setDeliveries] = useState<DeliveryActiveFulfillment[]>([])
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle')
  const watchIdRef = useRef<number | null>(null)

  const load = () => {
    api.get('/delivery/active/').then((r) => setDeliveries(r.data.data.deliveries || [])).catch(() => toast.error('Failed to load active deliveries.')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Share live location while there's an active delivery to track against. Ask clearly, and
  // surface denial instead of failing silently — the customer relies on this to see the rider coming.
  useEffect(() => {
    if (deliveries.length === 0) return
    if (!('geolocation' in navigator)) { setLocationStatus('unsupported'); return }

    setLocationStatus('requesting')
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationStatus('sharing')
        api.patch('/delivery/agent/location/', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {})
      },
      (err) => {
        setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported')
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [deliveries.length])

  const complete = async (delivery: DeliveryActiveFulfillment) => {
    const isCod = delivery.payment_method === 'CASH_ON_DELIVERY'
    const endpoint = isCod ? 'collect-cash' : 'mark-delivered'
    setCompletingId(delivery.id)
    try {
      await api.post(`/delivery/active/${delivery.id}/${endpoint}/`)
      toast.success(isCod ? 'Cash collected — delivery complete.' : 'Marked as delivered.')
      setDeliveries((prev) => prev.filter((d) => d.id !== delivery.id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to complete delivery.')
    } finally {
      setCompletingId(null)
    }
  }

  const LOCATION_BANNER: Record<LocationStatus, { text: string; color: string } | null> = {
    idle: null,
    requesting: { text: 'Requesting location permission...', color: 'bg-surface-container text-on-surface-variant' },
    sharing: { text: 'Sharing your live location with the customer.', color: 'bg-emerald-50 text-emerald-700' },
    denied: { text: 'Location permission denied — the customer won\'t see your live position. Enable location access for this site to share it.', color: 'bg-error/10 text-error' },
    unsupported: { text: 'Live location isn\'t available on this device/browser.', color: 'bg-surface-container text-on-surface-variant' },
  }
  const banner = LOCATION_BANNER[locationStatus]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Active Deliveries</h1>
        <p className="text-sm text-on-surface-variant mt-1">Your current pickups and drop-offs.</p>
      </div>

      {banner && (
        <div className={`rounded-xl px-4 py-2.5 text-xs font-medium ${banner.color}`}>{banner.text}</div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-56 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
      ) : deliveries.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>task_alt</span>
          <p className="mt-2 text-sm">No active deliveries — accept one from Requests.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {deliveries.map((d) => {
            const isCod = d.payment_method === 'CASH_ON_DELIVERY'
            return (
              <div key={d.id} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
                <p className="text-xs font-mono text-on-surface-variant">Order #{d.order_id.slice(0, 8).toUpperCase()}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>storefront</span>Pickup
                    </p>
                    <p className="text-sm font-bold text-on-surface mt-0.5">{d.pharmacy_name}</p>
                    <p className="text-xs text-on-surface-variant">{d.pharmacy_address}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wide flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>flag</span>Drop-off
                    </p>
                    <p className="text-sm font-bold text-on-surface mt-0.5">{d.customer_name || 'Customer'}</p>
                    <p className="text-xs text-on-surface-variant">{d.delivery_address}</p>
                    {d.customer_phone && (
                      <a href={`tel:${d.customer_phone}`} className="text-xs text-primary hover:underline">{d.customer_phone}</a>
                    )}
                  </div>
                </div>

                <div className="border-t border-outline-variant pt-3 space-y-1">
                  {d.items.map((item, i) => (
                    <p key={i} className="text-sm text-on-surface">{item.medicine_name} <span className="text-on-surface-variant">× {item.quantity}</span></p>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${isCod ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {isCod ? 'Collect Cash on Delivery' : 'Already Paid Online'}
                  </span>
                  {d.status === 'OUT_FOR_DELIVERY' ? (
                    <button onClick={() => complete(d)} disabled={completingId === d.id}
                      className="px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                      {isCod ? 'Confirm Cash Collected' : 'Mark Delivered'}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>storefront</span>
                      Heading to pharmacy — pharmacy is still preparing this order
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
