import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Pharmacies', template: '%s | PharmaX' } }

export default function AdminPharmaciesLayout({ children }: { children: React.ReactNode }) {
  return children
}
