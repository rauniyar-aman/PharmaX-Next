import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Prescriptions', template: '%s | PharmaX' } }

export default function AdminPrescriptionsLayout({ children }: { children: React.ReactNode }) {
  return children
}
