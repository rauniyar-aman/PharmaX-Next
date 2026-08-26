import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Health Article' }

export default function HealthArticleDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
