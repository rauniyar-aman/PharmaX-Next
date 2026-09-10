import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Lab Collectors', template: '%s | Swasthaya' } }

export default function AdminLabCollectorsLayout({ children }: { children: React.ReactNode }) {
  return children
}
