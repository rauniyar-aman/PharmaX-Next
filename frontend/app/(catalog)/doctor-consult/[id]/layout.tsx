import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Doctor Details' }

export default function DoctorDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
