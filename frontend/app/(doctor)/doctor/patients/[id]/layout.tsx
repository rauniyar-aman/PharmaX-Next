import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Patient Details' }

export default function DoctorPatientDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
