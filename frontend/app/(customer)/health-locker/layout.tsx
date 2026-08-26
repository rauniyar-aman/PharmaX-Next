import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Health Locker' }

export default function HealthLockerLayout({ children }: { children: React.ReactNode }) {
  return children
}
