import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Patients', template: '%s | PharmaX' } }

export default function DoctorPatientsLayout({ children }: { children: React.ReactNode }) {
  return children
}
