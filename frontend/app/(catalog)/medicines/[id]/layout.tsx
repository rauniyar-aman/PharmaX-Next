import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Medicine Details' }

export default function MedicineDetailLayout({ children }: { children: React.ReactNode }) {
  return children
}
