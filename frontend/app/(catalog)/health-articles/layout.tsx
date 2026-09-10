import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Health Articles', template: '%s | Swasthaya' } }

export default function HealthArticlesLayout({ children }: { children: React.ReactNode }) {
  return children
}
