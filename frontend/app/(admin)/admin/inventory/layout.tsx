import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Inventory', template: '%s | Swasthaya' } }

export default function AdminInventoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
