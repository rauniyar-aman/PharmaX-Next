import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Admin Orders', template: '%s | Swasthaya' } }

export default function AdminOrdersLayout({ children }: { children: React.ReactNode }) {
  return children
}
