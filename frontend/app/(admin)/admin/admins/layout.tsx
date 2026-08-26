import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Admins', template: '%s | PharmaX' } }

export default function AdminAdminsLayout({ children }: { children: React.ReactNode }) {
  return children
}
