'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import Logo from '@/components/common/Logo'
import { useAuthStore } from '@/store/auth'

const navItems = [
  { label: 'Dashboard',     href: '/admin/dashboard',     icon: 'dashboard',    code: 'view_reports' },
  { label: 'Medicines',     href: '/admin/medicines',     icon: 'medication',   code: 'manage_inventory' },
  { label: 'Categories',    href: '/admin/categories',    icon: 'category',     code: 'manage_inventory' },
  { label: 'Brands',        href: '/admin/brands',        icon: 'storefront',   code: 'manage_inventory' },
  { label: 'Inventory',     href: '/admin/inventory',     icon: 'inventory_2',  code: 'manage_inventory' },
  { label: 'Lab Tests',     href: '/admin/lab-tests',     icon: 'biotech',      code: 'manage_lab_tests' },
  { label: 'Lab Collectors', href: '/admin/lab-collectors', icon: 'medical_services', code: 'manage_lab_tests' },
  { label: 'Doctor Consult', href: '/admin/doctor-consult', icon: 'stethoscope', code: 'manage_doctors' },
  { label: 'Health Articles', href: '/admin/blog',        icon: 'article',      code: 'manage_blog' },
  { label: 'Subscriptions',  href: '/admin/subscriptions', icon: 'autorenew',   code: 'manage_subscriptions' },
  { label: 'Plus Membership', href: '/admin/plus-membership', icon: 'workspace_premium', code: 'manage_plus_membership' },
  { label: 'Marketing',      href: '/admin/marketing',     icon: 'campaign',    code: 'manage_marketing' },
  { label: 'Prescriptions', href: '/admin/prescriptions', icon: 'description', code: 'manage_prescriptions' },
  { label: 'Orders',        href: '/admin/orders',        icon: 'shopping_cart', code: 'manage_orders' },
  { label: 'Customers',     href: '/admin/customers',     icon: 'group',       code: 'manage_customers' },
  { label: 'Delivery',      href: '/admin/delivery',      icon: 'local_shipping', code: 'manage_orders' },
  { label: 'Pharmacies',    href: '/admin/pharmacies',    icon: 'local_pharmacy', code: 'manage_pharmacies' },
  { label: 'Campaigns',     href: '/admin/campaigns',     icon: 'redeem',         code: 'manage_pharmacies' },
  { label: 'Delivery Agents', href: '/admin/delivery-agents', icon: 'sports_motorsports', code: 'manage_delivery_agents' },
  { label: 'Wallet',        href: '/admin/wallet',        icon: 'account_balance_wallet', code: 'manage_finance' },
  { label: 'Finance',       href: '/admin/finance',       icon: 'payments', code: 'manage_finance' },
  { label: 'Reports',       href: '/admin/reports',       icon: 'bar_chart',   code: 'view_reports' },
  { label: 'Admins',        href: '/admin/admins',        icon: 'admin_panel_settings', superAdminOnly: true },
]

interface Props {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function AdminSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: Props) {
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)

  const isActive = (href: string) =>
    href === '/admin/dashboard' ? pathname === '/admin/dashboard' : pathname === href || pathname.startsWith(href + '/')

  const visibleItems = navItems.filter((item) => {
    if (user?.is_super_admin) return true
    if (item.superAdminOnly) return false
    return !!user?.permission_codes?.includes(item.code as string)
  })

  // Below md, the sidebar is an off-canvas drawer (fixed width, translated out of view unless
  // opened via the header's hamburger button) rather than the permanent icon-collapsible rail it
  // is on desktop — a 72-256px permanent rail left no usable width for content on a phone screen.
  // `iconOnly` intentionally ignores `collapsed` while the drawer is open on mobile: `collapsed`
  // is desktop-only state (persists across a resize within the same session), and a narrow
  // icon-only drawer would defeat the point of opening it on a phone in the first place.
  const iconOnly = collapsed && !mobileOpen

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`fixed left-0 top-0 h-full bg-surface-container-low flex flex-col z-50 transition-all duration-300 w-64 ${collapsed ? 'md:w-[72px]' : 'md:w-[256px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ boxShadow: '2px 0 12px -2px rgba(0,0,0,0.06)' }}
      >
        <div className={`flex items-center border-b border-outline-variant flex-shrink-0 ${iconOnly ? 'flex-col justify-center gap-2 px-3 py-3' : 'h-16 px-4 justify-between'}`}>
          {iconOnly ? (
            <>
              <Link href="/admin/dashboard">
                <Image src="/PharmaX_Icon.png" alt="PharmaX" width={36} height={36} className="h-9 w-auto object-contain" />
              </Link>
              <button onClick={onToggle} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>menu</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/admin/dashboard">
                <Logo iconSize={40} textClassName="text-xl" />
              </Link>
              <button onClick={mobileOpen ? onMobileClose : onToggle} className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{mobileOpen ? 'close' : 'menu_open'}</span>
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-0.5 px-2">
            {visibleItems.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link href={item.href} title={iconOnly ? item.label : undefined} onClick={onMobileClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${active ? 'bg-secondary-container text-on-secondary-container active-glow' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'} ${iconOnly ? 'justify-center px-0' : ''}`}>
                    <span className={`material-symbols-outlined flex-shrink-0 ${active ? 'ms-filled' : ''}`} style={{ fontSize: '20px' }}>{item.icon}</span>
                    {!iconOnly && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
