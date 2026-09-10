import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Prescriptions', template: '%s | Swasthaya' } }

export default function AdminPrescriptionsLayout({ children }: { children: React.ReactNode }) {
  return children
}
