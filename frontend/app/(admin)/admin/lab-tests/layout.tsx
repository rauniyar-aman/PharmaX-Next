import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Lab Tests', template: '%s | PharmaX' } }

export default function AdminLabTestsLayout({ children }: { children: React.ReactNode }) {
  return children
}
