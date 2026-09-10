import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Finance', template: '%s | Swasthaya' } }

export default function AdminFinanceLayout({ children }: { children: React.ReactNode }) {
  return children
}
