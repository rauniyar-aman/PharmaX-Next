import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Customer Details' }

export default function AdminCustomerDetailsLayout({ children }: { children: React.ReactNode }) {
  return children
}
