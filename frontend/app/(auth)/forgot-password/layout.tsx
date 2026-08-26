import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Forgot Password', template: '%s | PharmaX' } }

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
