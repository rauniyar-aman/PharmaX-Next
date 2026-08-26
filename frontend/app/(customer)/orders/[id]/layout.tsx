import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Order Details', template: '%s | PharmaX' } }

export default function OrderDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
