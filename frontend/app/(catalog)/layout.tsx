'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import PublicHeader from '@/components/common/PublicHeader'

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && user?.role === 'ADMIN') router.replace('/admin/dashboard')
  }, [hydrated, user, router])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user?.role === 'ADMIN') return null

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
