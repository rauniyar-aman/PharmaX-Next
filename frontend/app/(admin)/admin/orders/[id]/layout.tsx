import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Order Details' }

export default function AdminOrderDetailsLayout({ children }: { children: React.ReactNode }) {
  return children
}
