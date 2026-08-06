'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'

export default function AboutPage() {
  const { dark, toggle: toggleDark } = useThemeStore()

  return (
    <div className="min-h-screen bg-background text-on-background">
      {/* Navbar */}
      <header className="border-b border-outline-variant bg-surface">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/"><Image src="/PharmaX_Logo.png" alt="PharmaX" width={44} height={44} className="h-11 w-auto" /></Link>
          <nav className="flex items-center gap-3">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <Link href="/signin" className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary-dark transition-colors">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-20">

        {/* Hero */}
        <section className="text-center space-y-6">
          <Image src="/PharmaX_Logo.png" alt="PharmaX" width={112} height={112} className="h-28 w-auto mx-auto" />
          <div>
            <h1 className="text-4xl font-bold text-on-surface">PharmaX</h1>
            <p className="mt-3 text-lg text-on-surface-variant max-w-xl mx-auto">
              A full-stack online pharmacy platform — order medicines, upload prescriptions, and track deliveries, all in one place.
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/signup" className="px-6 py-3 bg-primary text-on-primary text-sm font-semibold rounded-2xl hover:bg-primary-dark transition-colors">
              Create Account
            </Link>
            <Link href="/signin" className="px-6 py-3 border border-outline-variant text-on-surface text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
              Sign In
            </Link>
          </div>
        </section>

        {/* Customer Features */}
        <section>
          <h2 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary ms-filled">person</span>
            Customer Features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: 'medication', title: 'Browse Medicines', desc: 'Search OTC and prescription medicines with filters' },
              { icon: 'shopping_cart', title: 'Cart & Checkout', desc: 'Add to cart, choose address, pay online or on delivery' },
              { icon: 'description', title: 'Prescriptions', desc: 'Upload doctor prescriptions for Rx medicines' },
              { icon: 'local_shipping', title: 'Order Tracking', desc: 'Real-time order status from placed to delivered' },
              { icon: 'favorite', title: 'Wishlist', desc: 'Save medicines to buy later' },
              { icon: 'rate_review', title: 'Reviews', desc: 'Rate and review medicines you have purchased' },
            ].map((f) => (
              <div key={f.title} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
                <span className="material-symbols-outlined text-primary ms-filled" style={{ fontSize: '24px' }}>{f.icon}</span>
                <p className="font-semibold text-on-surface text-sm">{f.title}</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Admin Features */}
        <section>
          <h2 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary ms-filled">admin_panel_settings</span>
            Admin Features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: 'dashboard', title: 'Dashboard', desc: 'Overview of orders, revenue, and customers' },
              { icon: 'inventory_2', title: 'Inventory', desc: 'Manage stock levels and get low-stock alerts' },
              { icon: 'group', title: 'Customers', desc: 'View customer profiles and order history' },
              { icon: 'verified', title: 'Prescription Review', desc: 'Approve or reject uploaded prescriptions' },
              { icon: 'bar_chart', title: 'Reports', desc: 'Sales analytics and medicine performance' },
              { icon: 'category', title: 'Catalogue', desc: 'Add and manage medicines and categories' },
            ].map((f) => (
              <div key={f.title} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-2">
                <span className="material-symbols-outlined text-secondary ms-filled" style={{ fontSize: '24px' }}>{f.icon}</span>
                <p className="font-semibold text-on-surface text-sm">{f.title}</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tech Stack */}
        <section>
          <h2 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">code</span>
            Tech Stack
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Next.js 16', sub: 'App Router + TypeScript' },
              { label: 'Django 6', sub: 'REST Framework' },
              { label: 'PostgreSQL', sub: 'Primary database' },
              { label: 'Tailwind CSS 4', sub: 'Styling' },
            ].map((t) => (
              <div key={t.label} className="bg-surface-container-low rounded-2xl border border-outline-variant px-4 py-4 text-center">
                <p className="font-bold text-on-surface text-sm">{t.label}</p>
                <p className="text-xs text-on-surface-variant mt-1">{t.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Open Source */}
        <section>
          <h2 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-on-surface-variant">code_blocks</span>
            Open Source
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a href="https://github.com/rauniyar-aman/PharmaX_Dev" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 bg-surface rounded-2xl border border-outline-variant p-5 hover:bg-surface-container transition-colors group">
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-on-surface" style={{ fontSize: '28px' }}>web</span>
              <div>
                <p className="font-semibold text-on-surface text-sm">Web App (React + Express)</p>
                <p className="text-xs text-on-surface-variant mt-0.5">github.com/rauniyar-aman/PharmaX_Dev</p>
              </div>
            </a>
            <a href="https://github.com/rauniyar-aman/PharmaX" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 bg-surface rounded-2xl border border-outline-variant p-5 hover:bg-surface-container transition-colors group">
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-on-surface" style={{ fontSize: '28px' }}>android</span>
              <div>
                <p className="font-semibold text-on-surface text-sm">Android App (Kotlin)</p>
                <p className="text-xs text-on-surface-variant mt-0.5">github.com/rauniyar-aman/PharmaX</p>
              </div>
            </a>
          </div>
        </section>

      </main>

      <footer className="border-t border-outline-variant mt-8 py-8 text-center text-xs text-on-surface-variant">
        PharmaX — Built with Next.js &amp; Django
      </footer>
    </div>
  )
}
