import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Lab Tests', template: '%s | Swasthaya' } }

export default function LabTestsLayout({ children }: { children: React.ReactNode }) {
  return children
}
