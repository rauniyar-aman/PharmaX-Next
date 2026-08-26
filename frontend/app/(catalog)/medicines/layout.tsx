import type { Metadata } from 'next'

export const metadata: Metadata = { title: { default: 'Medicines', template: '%s | PharmaX' } }

export default function MedicinesLayout({ children }: { children: React.ReactNode }) {
  return children
}
