import Link from 'next/link'
import CarouselRow from '@/components/common/CarouselRow'

// These are deliberately quick *actions* / account shortcuts, NOT the category-browse links in the
// header nav (Medicines, Lab Tests, Doctor Consult, Healthcare, Health Insights, PLUS, Offers) or
// the homepage "Our Services" section. Every destination here is absent from both so the icon grid
// complements the text nav instead of duplicating it.
const ITEMS = [
  { label: 'Upload Rx', tagline: 'Order fast', icon: 'upload_file', href: '/prescriptions' },
  { label: 'My Orders', tagline: 'Track & reorder', icon: 'receipt_long', href: '/orders' },
  { label: 'Wallet', tagline: 'Swasthaya Cash', icon: 'account_balance_wallet', href: '/wallet' },
  { label: 'Refer & Earn', tagline: 'Get rewards', icon: 'redeem', href: '/referrals' },
  { label: 'Reminders', tagline: 'Never miss a dose', icon: 'alarm', href: '/reminders' },
  { label: 'Subscribe', tagline: 'Auto-refill', icon: 'autorenew', href: '/subscriptions' },
  { label: 'Wishlist', tagline: 'Saved items', icon: 'favorite', href: '/wishlist' },
]

export default function QuickLinksGrid() {
  return (
    // Left-clustered horizontal scroll of fixed-width tiles (same pattern as CategoryRail /
    // BrandRail) rather than a full-width grid — on wide viewports a 7-col grid stretched these
    // apart with big gutters and read as a different system from the neighbouring rails.
    <section>
      <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel="quick actions">
        {ITEMS.map((item) => (
          <Link key={item.label} href={item.href}
            className="flex flex-col items-center text-center gap-1.5 w-20 sm:w-24 flex-shrink-0 group">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary/20 group-hover:-translate-y-0.5 transition-all duration-200">
              <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>{item.icon}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface leading-tight">{item.label}</p>
              <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{item.tagline}</p>
            </div>
          </Link>
        ))}
      </CarouselRow>
    </section>
  )
}
