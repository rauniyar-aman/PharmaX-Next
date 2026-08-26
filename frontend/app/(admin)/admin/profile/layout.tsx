import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin Profile' }

export default function AdminProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
