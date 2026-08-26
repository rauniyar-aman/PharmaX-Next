import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Orders', template: '%s | PharmaX' } }

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children
}
