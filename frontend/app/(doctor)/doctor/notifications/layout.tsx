import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Notifications', template: '%s | Swasthaya' } }

export default function DoctorNotificationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
