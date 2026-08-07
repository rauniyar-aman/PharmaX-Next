import Link from 'next/link'

const BANNERS = [
  {
    title: 'Track Your Orders in Real-Time',
    subtitle: 'Follow every order from placed to delivered, right from your account.',
    cta: 'Track Orders', href: '/orders', icon: 'local_shipping',
    gradient: 'from-primary to-primary/70',
  },
  {
    title: 'Save Items to Your Wishlist',
    subtitle: 'Keep an eye on medicines you need and order them whenever you’re ready.',
    cta: 'View Wishlist', href: '/wishlist', icon: 'favorite',
    gradient: 'from-rose-500 to-rose-600',
  },
  {
    title: 'Manage Delivery Addresses',
    subtitle: 'Save home, work, or family addresses for faster checkout every time.',
    cta: 'Add Address', href: '/addresses', icon: 'location_on',
    gradient: 'from-indigo-500 to-indigo-600',
  },
]

export default function PromoBannerGrid() {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {BANNERS.map((b) => (
        <Link key={b.title} href={b.href}
          className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${b.gradient} text-white flex flex-col justify-between min-h-[150px] hover:opacity-95 transition-opacity`}>
          <span className="material-symbols-outlined ms-filled absolute -right-3 -bottom-3 text-white/15" style={{ fontSize: '96px' }}>
            {b.icon}
          </span>
          <div className="relative">
            <p className="text-sm font-bold leading-snug">{b.title}</p>
            <p className="text-xs text-white/85 mt-1.5 leading-relaxed">{b.subtitle}</p>
          </div>
          <span className="relative inline-flex items-center gap-1 mt-3 text-xs font-bold">
            {b.cta}
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>arrow_forward</span>
          </span>
        </Link>
      ))}
    </section>
  )
}
