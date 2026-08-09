'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import PublicHeader from '@/components/common/PublicHeader'

// Mirrors the redirect map in signin/restore-account — every non-customer role has its own
// dashboard and should never end up browsing the customer catalog while logged in as themselves.
const NON_CUSTOMER_DASHBOARDS: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  PHARMACY: '/pharmacy/dashboard',
  DELIVERY_AGENT: '/delivery/requests',
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || !user) return
    const dashboard = NON_CUSTOMER_DASHBOARDS[user.role]
    if (dashboard) router.replace(dashboard)
  }, [hydrated, user, router])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user && NON_CUSTOMER_DASHBOARDS[user.role]) return null

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="w-full px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
