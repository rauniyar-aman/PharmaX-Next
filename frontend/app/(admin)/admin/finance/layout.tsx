import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Finance', template: '%s | PharmaX' } }

export default function AdminFinanceLayout({ children }: { children: React.ReactNode }) {
  return children
}
