import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Categories', template: '%s | Swasthaya' } }

export default function AdminCategoriesLayout({ children }: { children: React.ReactNode }) {
  return children
}
