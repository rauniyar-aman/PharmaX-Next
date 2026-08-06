'use client'
import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { useThemeStore } from '@/store/theme'

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { dark, toggle: toggleDark } = useThemeStore()

  return (
    <div className="min-h-screen flex flex-col bg-background px-4 py-10 sm:px-6 relative">
      <div className="absolute top-5 left-6">
        <Link href="/">
          <Image src="/PharmaX_Logo.png" alt="PharmaX" width={48} height={48} className="h-12 w-auto" />
        </Link>
      </div>
      <button onClick={toggleDark}
        className="absolute top-5 right-6 p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
          {dark ? 'light_mode' : 'dark_mode'}
        </span>
      </button>
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}
