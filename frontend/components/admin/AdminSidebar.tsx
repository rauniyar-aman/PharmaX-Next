'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard',     href: '/admin/dashboard',     icon: 'dashboard' },
  { label: 'Medicines',     href: '/admin/medicines',     icon: 'medication' },
  { label: 'Categories',    href: '/admin/categories',    icon: 'category' },
  { label: 'Inventory',     href: '/admin/inventory',     icon: 'inventory_2' },
  { label: 'Prescriptions', href: '/admin/prescriptions', icon: 'description' },
  { label: 'Orders',        href: '/admin/orders',        icon: 'shopping_cart' },
  { label: 'Customers',     href: '/admin/customers',     icon: 'group' },
  { label: 'Delivery',      href: '/admin/delivery',      icon: 'local_shipping' },
  { label: 'Reports',       href: '/admin/reports',       icon: 'bar_chart' },
]

interface Props {
  collapsed: boolean
  onToggle: () => void
}

export default function AdminSidebar({ collapsed, onToggle }: Props) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/admin/dashboard' ? pathname === '/admin/dashboard' : pathname.startsWith(href)

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-surface-container-low flex flex-col z-30 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[256px]'}`}
      style={{ boxShadow: '2px 0 12px -2px rgba(0,0,0,0.06)' }}
    >
      <div className={`flex items-center border-b border-outline-variant flex-shrink-0 ${collapsed ? 'flex-col justify-center gap-2 px-3 py-3' : 'h-16 px-4 justify-between'}`}>
        {collapsed ? (
          <>
            <Image src="/PharmaX_Logo.png" alt="PharmaX" width={36} height={36} className="h-9 w-auto object-contain" />
            <button onClick={onToggle} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu</span>
            </button>
          </>
        ) : (
          <>
            <Image src="/PharmaX_Logo.png" alt="PharmaX" width={48} height={48} className="h-12 w-auto" />
            <button onClick={onToggle} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu_open</span>
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link href={item.href} title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${active ? 'bg-secondary-container text-on-secondary-container active-glow' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'} ${collapsed ? 'justify-center px-0' : ''}`}>
                  <span className={`material-symbols-outlined flex-shrink-0 ${active ? 'ms-filled' : ''}`} style={{ fontSize: '20px' }}>{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
