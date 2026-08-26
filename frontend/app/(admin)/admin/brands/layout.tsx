import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Brands', template: '%s | PharmaX' } }

export default function AdminBrandsLayout({ children }: { children: React.ReactNode }) {
  return children
}
