import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Payment Method' }

export default function CheckoutPaymentLayout({ children }: { children: React.ReactNode }) {
  return children
}
