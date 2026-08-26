import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Delivery Agents', template: '%s | PharmaX' } }

export default function AdminDeliveryAgentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
