'use client'
import { create } from 'zustand'
import api from '@/lib/api'
import type { PharmacyFulfillmentRequest } from '@/types'

const POLL_MS = 5000

interface PharmacyRequestsStore {
  requests: PharmacyFulfillmentRequest[]
  loading: boolean
  /** Set once per genuinely-new batch of requests (not on first load) — a fresh `at` timestamp
   * each time, so consumers can key a useEffect off it to fire alerts exactly once per arrival. */
  lastArrival: { items: PharmacyFulfillmentRequest[]; at: number } | null
  _knownIds: Set<string> | null
  _timer: ReturnType<typeof setInterval> | null
  startPolling: () => void
  stopPolling: () => void
  removeRequest: (id: string) => void
  refetch: () => Promise<void>
}

/** Single source of truth for the pharmacy's incoming-requests poll — started once from
 * (pharmacy)/layout.tsx so it runs across every pharmacy page, not just /pharmacy/requests.
 * That page reads from here instead of running its own separate interval. */
export const usePharmacyRequestsStore = create<PharmacyRequestsStore>((set, get) => ({
  requests: [],
  loading: true,
  lastArrival: null,
  _knownIds: null,
  _timer: null,

  refetch: async () => {
    try {
      const res = await api.get('/pharmacy/requests/')
      const requests: PharmacyFulfillmentRequest[] = res.data.data.requests || []
      const currentIds = new Set(requests.map((r) => r.id))
      const known = get()._knownIds

      if (known === null) {
        // first fetch since (re)mount — these already existed, not a "new arrival" to alert on
        set({ requests, loading: false, _knownIds: currentIds })
        return
      }

      const newOnes = requests.filter((r) => !known.has(r.id))
      set({
        requests,
        loading: false,
        _knownIds: currentIds,
        ...(newOnes.length > 0 ? { lastArrival: { items: newOnes, at: Date.now() } } : {}),
      })
    } catch {
      set({ loading: false })
    }
  },

  startPolling: () => {
    if (get()._timer) return // already running
    get().refetch()
    const timer = setInterval(() => get().refetch(), POLL_MS)
    set({ _timer: timer })
  },

  stopPolling: () => {
    const timer = get()._timer
    if (timer) clearInterval(timer)
    set({ _timer: null, _knownIds: null, requests: [], loading: true, lastArrival: null })
  },

  removeRequest: (id) => {
    set((s) => ({ requests: s.requests.filter((r) => r.id !== id) }))
  },
}))
