'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'
import { useThemeStore } from '@/store/theme'

export default function PublicHeader() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const user = useAuthStore((s) => s.user)
  const cartCount = useCartStore((s) => s.count)
  const { dark, toggle: toggleDark } = useThemeStore()
  const [query, setQuery] = useState('')

  useEffect(() => {
    useAuthStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/medicines${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ''}`)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex-shrink-0">
          <Image src="/PharmaX_Logo.png" alt="PharmaX" width={40} height={40} className="h-10 w-auto" />
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden sm:block">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search medicines, brands, categories..."
              className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-full bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition"
            />
          </div>
        </form>

        <nav className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <button onClick={toggleDark}
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
              {dark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <Link href={hydrated && user ? '/cart' : '/signin'} className="relative p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>shopping_cart</span>
            {hydrated && cartCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-secondary text-on-secondary text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </Link>

          {hydrated && user ? (
            <Link href={user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard'}
              className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl hover:bg-surface-container transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                {user.full_name?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="hidden md:block text-sm font-semibold text-on-surface">{user.full_name?.split(' ')[0]}</span>
            </Link>
          ) : (
            <>
              <Link href="/signin" className="px-3 sm:px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="px-3 sm:px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary-dark transition-colors whitespace-nowrap">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
      <form onSubmit={handleSearch} className="sm:hidden px-4 pb-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '20px' }}>search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines..."
            className="w-full pl-10 pr-4 py-2.5 border border-outline-variant rounded-full bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition"
          />
        </div>
      </form>
    </header>
  )
}
