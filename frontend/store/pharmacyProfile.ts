'use client'
import { create } from 'zustand'
import api from '@/lib/api'
import type { PharmacyProfile } from '@/types'

interface PharmacyProfileStore {
  pharmacy: PharmacyProfile | null
  loading: boolean
  fetchProfile: () => Promise<void>
  setPharmacy: (p: PharmacyProfile) => void
}

/** Single source of truth for the logged-in pharmacy's own profile (name, online/offline status,
 * bank details, ...) — shared between the layout's nav toggle and the Settings page so toggling
 * online/offline from either place is instantly reflected in the other, without a page reload. */
export const usePharmacyProfileStore = create<PharmacyProfileStore>((set) => ({
  pharmacy: null,
  loading: true,

  fetchProfile: async () => {
    try {
      const res = await api.get('/pharmacy/profile/')
      set({ pharmacy: res.data.data.pharmacy, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setPharmacy: (p) => set({ pharmacy: p }),
}))
