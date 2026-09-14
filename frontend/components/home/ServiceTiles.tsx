import Link from 'next/link'
import { resolveImg } from '@/lib/resolveImg'

// The colourful "shop by service" grid — the storefront's primary entry points, shown as vivid
// icon tiles instead of the flat text buttons/monochrome tiles they replace (Flipkart/PharmEasy
// style). Every tile is *image-ready*: if a tile ever gets an uploaded illustration (`image`), it
// renders that in place of the icon with zero markup change — until then the coloured icon disc is
// the finished look, so this ships with no new art. All eight are always visible (a responsive
// 4→8 col grid, not a scroll row) since these are the main destinations, not a long tail.
interface ServiceTile {
  label: string
  href: string
  icon: string
  tile: string   // soft tinted tile background
  disc: string   // saturated icon disc
  image?: string // optional uploaded illustration; overrides the icon when present
}

const TILES: ServiceTile[] = [
  { label: 'Medicines', href: '/medicines', icon: 'medication', tile: 'bg-emerald-500/10', disc: 'bg-emerald-500' },
  { label: 'Lab Tests', href: '/lab-tests', icon: 'science', tile: 'bg-sky-500/10', disc: 'bg-sky-500' },
  { label: 'Doctor Consult', href: '/doctor-consult', icon: 'stethoscope', tile: 'bg-blue-500/10', disc: 'bg-blue-600' },
  { label: 'Healthcare', href: '/medicines?category=Healthcare+Devices', icon: 'monitor_heart', tile: 'bg-teal-500/10', disc: 'bg-teal-500' },
  { label: 'Value Packages', href: '/lab-tests?packages=1', icon: 'inventory_2', tile: 'bg-purple-500/10', disc: 'bg-purple-600' },
  { label: 'Offers', href: '/offers', icon: 'sell', tile: 'bg-amber-500/10', disc: 'bg-amber-500' },
  { label: 'Swasthaya Plus', href: '/plus-membership', icon: 'workspace_premium', tile: 'bg-indigo-500/10', disc: 'bg-indigo-600' },
  { label: 'Upload Prescription', href: '/prescriptions', icon: 'upload_file', tile: 'bg-rose-500/10', disc: 'bg-rose-500' },
]

export default function ServiceTiles() {
  return (
    <section>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2.5 sm:gap-3">
        {TILES.map((t) => {
          const img = resolveImg(t.image)
          return (
            <Link key={t.label} href={t.href}
              className={`group flex flex-col items-center gap-2 rounded-2xl ${t.tile} p-3 sm:p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`}>
              <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl ${img ? 'bg-surface' : t.disc} text-white flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform`}>
                {img ? (
                  <img src={img} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '26px' }}>{t.icon}</span>
                )}
              </div>
              <span className="text-[11px] sm:text-sm font-semibold text-on-surface text-center leading-tight">{t.label}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
