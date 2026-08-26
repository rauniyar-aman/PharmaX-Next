import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Doctor Dashboard' }

export default function DoctorDashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
