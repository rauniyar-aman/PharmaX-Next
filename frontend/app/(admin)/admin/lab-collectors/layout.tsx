import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Lab Collectors', template: '%s | PharmaX' } }

export default function AdminLabCollectorsLayout({ children }: { children: React.ReactNode }) {
  return children
}
