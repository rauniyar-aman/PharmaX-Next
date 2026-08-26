import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pharmacy Orders' }

export default function PharmacyOrdersLayout({ children }: { children: React.ReactNode }) {
  return children
}
