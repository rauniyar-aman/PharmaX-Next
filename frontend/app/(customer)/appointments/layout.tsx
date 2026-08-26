import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Appointments', template: '%s | PharmaX' } }

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
