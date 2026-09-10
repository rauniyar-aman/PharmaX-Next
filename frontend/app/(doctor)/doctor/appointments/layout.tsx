import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Doctor Appointments', template: '%s | Swasthaya' } }

export default function DoctorAppointmentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
