import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Customers', template: '%s | Swasthaya' } }

export default function AdminCustomersLayout({ children }: { children: React.ReactNode }) {
  return children
}
