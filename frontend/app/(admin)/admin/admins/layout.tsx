import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Admins', template: '%s | Swasthaya' } }

export default function AdminAdminsLayout({ children }: { children: React.ReactNode }) {
  return children
}
