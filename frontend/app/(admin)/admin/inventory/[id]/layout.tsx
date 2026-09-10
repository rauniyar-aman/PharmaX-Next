import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Update Stock', template: '%s | Swasthaya' } }

export default function AdminUpdateStockLayout({ children }: { children: React.ReactNode }) {
  return children
}
