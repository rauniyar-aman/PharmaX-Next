import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Blog', template: '%s | PharmaX' } }

export default function AdminBlogLayout({ children }: { children: React.ReactNode }) {
  return children
}
