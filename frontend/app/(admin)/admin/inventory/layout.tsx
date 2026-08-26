import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Inventory', template: '%s | PharmaX' } }

export default function AdminInventoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
