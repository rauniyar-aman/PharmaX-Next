import Link from 'next/link'

const ITEMS = [
  { label: 'Medicine', tagline: 'Order Now', icon: 'medication', href: '/medicines' },
  { label: 'Lab Tests', tagline: 'Book at Home', icon: 'biotech', href: '/lab-tests' },
  { label: 'Doctor Consult', tagline: 'Consult Online', icon: 'stethoscope', href: '/doctor-consult' },
  { label: 'Healthcare', tagline: 'Shop Devices', icon: 'devices_other', href: '/medicines?category=Healthcare+Devices' },
  { label: 'Health Blogs', tagline: 'Read Tips', icon: 'article', href: '/health-articles' },
  { label: 'PLUS', tagline: 'Save More', icon: 'workspace_premium', href: '/plus-membership' },
  { label: 'Offers', tagline: 'Best Deals', icon: 'sell', href: '/offers' },
]

export default function QuickLinksGrid() {
  return (
    <section className="grid grid-cols-4 sm:grid-cols-7 gap-3 sm:gap-4">
      {ITEMS.map((item) => (
        <Link key={item.label} href={item.href}
          className="flex flex-col items-center text-center gap-1.5 group">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/20 group-hover:-translate-y-0.5 transition-all duration-200">
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>{item.icon}</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface leading-tight">{item.label}</p>
            <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{item.tagline}</p>
          </div>
        </Link>
      ))}
    </section>
  )
}
