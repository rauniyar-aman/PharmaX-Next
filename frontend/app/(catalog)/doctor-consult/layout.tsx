import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Doctor Consult', template: '%s | PharmaX' } }

export default function DoctorConsultLayout({ children }: { children: React.ReactNode }) {
  return children
}
