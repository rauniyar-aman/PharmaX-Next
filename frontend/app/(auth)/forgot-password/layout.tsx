import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Forgot Password', template: '%s | Swasthaya' } }

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
