import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Brands', template: '%s | Swasthaya' } }

export default function AdminBrandsLayout({ children }: { children: React.ReactNode }) {
  return children
}
