'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LocationStore {
  label: string | null
  lat: number | null
  lng: number | null
  setLocation: (loc: { label: string; lat?: number; lng?: number }) => void
  clear: () => void
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      label: null,
      lat: null,
      lng: null,
      setLocation: ({ label, lat, lng }) => set({ label, lat: lat ?? null, lng: lng ?? null }),
      clear: () => set({ label: null, lat: null, lng: null }),
    }),
    { name: 'pharmax-location' },
  ),
)
