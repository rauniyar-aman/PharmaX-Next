'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { type Slide } from '@/components/common/PromoSlider'
import { HERO_PHOTOS } from '@/lib/demoImages'

// The lead visual for the storefront and dashboard: one big, full-width, auto-rotating photo banner
// (Amazon / Flipkart / PharmEasy style) instead of the small side-by-side gradient cards the old
// PromoSlider showed. Real HERO promo banners are used when they exist; otherwise it falls back to a
// curated set of demo slides so the top of the page always leads with imagery, never an empty strip.
const DEFAULT_SLIDES: Slide[] = [
  { title: 'Medicines, delivered fast', subtitle: 'Genuine products at up to 25% off MRP, brought to your door.', cta: 'Shop medicines', href: '/medicines', icon: 'medication', gradient: 'from-emerald-600 to-teal-700', image_url: HERO_PHOTOS[1] },
  { title: 'Lab tests, sampled at home', subtitle: 'Book online, a technician collects the sample, reports come to you.', cta: 'Book a test', href: '/lab-tests', icon: 'science', gradient: 'from-sky-600 to-indigo-700', image_url: HERO_PHOTOS[0] },
  { title: 'Talk to a doctor today', subtitle: 'Consult verified doctors by video, no waiting room.', cta: 'Consult now', href: '/doctor-consult', icon: 'stethoscope', gradient: 'from-blue-600 to-violet-700', image_url: HERO_PHOTOS[2] },
  { title: 'Upload a prescription', subtitle: 'Send us your Rx and we handle the rest — sourcing, pricing, delivery.', cta: 'Upload prescription', href: '/prescriptions', icon: 'upload_file', gradient: 'from-primary to-blue-800', image_url: HERO_PHOTOS[3] },
]

interface Props {
  slides?: Slide[]
  className?: string
}

export default function HeroBanner({ slides, className = '' }: Props) {
  const list = slides && slides.length > 0 ? slides : DEFAULT_SLIDES
  const [idx, setIdx] = useState(0)

  // Keep the index in range if the slide list changes length (e.g. real banners arrive after fetch).
  useEffect(() => { setIdx((i) => (i >= list.length ? 0 : i)) }, [list.length])

  const go = useCallback((n: number) => setIdx(((n % list.length) + list.length) % list.length), [list.length])

  // Touch swipe (mobile/tablet): drag left → next, right → previous. We record the start point and,
  // on release, treat a mostly-horizontal move past a small threshold as a swipe — then suppress the
  // click that would otherwise follow so a swipe never also navigates to the slide's link.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    swiped.current = false
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true
      go(idx + (dx < 0 ? 1 : -1))
    }
  }
  // A swipe that ends on a slide would otherwise fire the link's navigation — swallow that one click.
  const onSlideClick = (e: React.MouseEvent) => {
    if (swiped.current) { e.preventDefault(); swiped.current = false }
  }

  // Auto-advance every 6s; a single slide doesn't rotate. Re-arms on idx change so a manual jump
  // gives the viewer a fresh full interval on the slide they chose.
  useEffect(() => {
    if (list.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 6000)
    return () => clearInterval(t)
  }, [list.length, idx])

  return (
    <section className={className}>
      <div
        className="relative w-full h-52 sm:h-64 md:h-80 overflow-hidden rounded-2xl sm:rounded-3xl bg-surface-container touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {list.map((s, i) => {
          // A real uploaded banner image always wins; otherwise back the slide with a curated hero
          // photo (keyed by position) so the banner reads as a rich photo strip instead of a flat
          // gradient. The gradient stays only as a last-resort fallback if no photo is available.
          const bg = s.image_url || HERO_PHOTOS[i % HERO_PHOTOS.length]
          return (
            <Link
              key={i}
              href={s.href}
              onClick={onSlideClick}
              aria-hidden={i !== idx}
              tabIndex={i === idx ? 0 : -1}
              className={`group absolute inset-0 transition-opacity duration-700 ${i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {bg ? (
                <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-r ${s.gradient || 'from-primary to-blue-800'}`} />
              )}
              {/* Left-anchored scrim keeps the headline legible over any photo. */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
              <div className="relative h-full flex flex-col justify-center gap-2 sm:gap-3 max-w-md px-6 sm:px-10 md:px-12">
                <h2 className="text-white text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight drop-shadow-sm">{s.title}</h2>
                {s.subtitle && <p className="text-white/85 text-sm sm:text-base leading-snug max-w-sm">{s.subtitle}</p>}
                <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-primary shadow-md group-hover:gap-2 transition-all">
                  {s.cta || 'Explore'}
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
                </span>
              </div>
            </Link>
          )
        })}

        {list.length > 1 && (
          <>
            {/* Prev / next controls appear on hover from md up; dots are the primary control on touch. */}
            <button aria-label="Previous slide" onClick={() => go(idx - 1)}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white text-primary items-center justify-center shadow-md opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>chevron_left</span>
            </button>
            <button aria-label="Next slide" onClick={() => go(idx + 1)}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/85 hover:bg-white text-primary items-center justify-center shadow-md opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>chevron_right</span>
            </button>
            <div className="absolute bottom-3 left-6 sm:left-10 md:left-12 flex gap-1.5">
              {list.map((_, i) => (
                <button key={i} aria-label={`Go to slide ${i + 1}`} onClick={() => go(i)}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
