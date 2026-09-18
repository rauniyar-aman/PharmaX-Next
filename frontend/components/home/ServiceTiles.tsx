import Link from 'next/link'
import { resolveImg } from '@/lib/resolveImg'

// The storefront's primary entry points. This grid used to give each tile its own hue (emerald,
// sky, blue, teal, purple, amber, indigo, rose) so the eight destinations would read as eight
// different things — but colour now carries state across the product (green done, amber due, red
// needs you), so spending eight hues on what is really one navigation control made the palette
// meaningless everywhere else. The grid is brand navy throughout; the single green tile is the
// highest-intent action in it, and it's the only accent the row spends.
// Every tile stays *image-ready*: give a tile an uploaded illustration (`image`) and it renders in
// place of the icon with no markup change — until then the icon disc is the finished look.
interface ServiceTile {
  label: string
  href: string
  icon: string
  accent?: boolean // the one action tile — brand green instead of navy
  image?: string   // optional uploaded illustration; overrides the icon when present
}

const TILES: ServiceTile[] = [
  { label: 'Medicines', href: '/medicines', icon: 'medication' },
  { label: 'Lab Tests', href: '/lab-tests', icon: 'science' },
  { label: 'Doctor Consult', href: '/doctor-consult', icon: 'stethoscope' },
  { label: 'Healthcare', href: '/medicines?category=Healthcare+Devices', icon: 'monitor_heart' },
  { label: 'Value Packages', href: '/lab-tests?packages=1', icon: 'inventory_2' },
  { label: 'Offers', href: '/offers', icon: 'sell' },
  { label: 'Swasthaya Plus', href: '/plus-membership', icon: 'workspace_premium' },
  { label: 'Upload Prescription', href: '/prescriptions', icon: 'upload_file', accent: true },
]

export default function ServiceTiles() {
  return (
    <section>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2.5 sm:gap-3">
        {TILES.map((t) => {
          const img = resolveImg(t.image)
          return (
            <Link key={t.label} href={t.href}
              className={`group flex flex-col items-center gap-2 rounded-2xl p-3 sm:p-4 transition-colors ${
                t.accent ? 'bg-secondary/10 hover:bg-secondary/15' : 'bg-primary/[0.07] hover:bg-primary/[0.12]'
              }`}>
              <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center overflow-hidden ${
                img ? 'bg-surface' : t.accent ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary'
              }`}>
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
