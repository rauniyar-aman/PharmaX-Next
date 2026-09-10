'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface LabCartItem {
  id: string
  name: string
  price: string
  is_package: boolean
}

interface LabCartStore {
  items: LabCartItem[]
  add: (item: LabCartItem) => void
  remove: (id: string) => void
  clear: () => void
}

// A client-side cart of lab tests to book together in one checkout. Unlike the medicine cart (which
// is server-side because it has quantities and stock), a lab test is a single, one-off thing with no
// quantity — so a persisted list of distinct tests in localStorage is the lighter, sufficient choice.
export const useLabCartStore = create<LabCartStore>()(
  persist(
    (set) => ({
      items: [],
      // Adding a test already in the cart is a no-op — there is no quantity to bump, and the checkout
      // books one booking per line, so a duplicate line would just double-charge for the same test.
      add: (item) => set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, item] })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'pharmax-lab-cart' },
  ),
)
