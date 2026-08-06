'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import Sidebar from '@/components/sidebar/Sidebar'
import DashboardNavbar from '@/components/navbar/DashboardNavbar'

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !user) router.replace('/signin')
  }, [hydrated, user, router])

  if (!hydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user.role === 'ADMIN') {
    router.replace('/admin/dashboard')
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((p) => !p)} />
      <DashboardNavbar sidebarCollapsed={collapsed} />
      <main
        className="transition-all duration-300 pt-16 min-h-screen"
        style={{ marginLeft: collapsed ? '72px' : '256px' }}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
