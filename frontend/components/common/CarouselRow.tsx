'use client'
import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Utility classes for the scroll track itself (gap, padding, edge-bleed) — the flex + overflow
   *  + scrollbar-hide base is always applied. */
  className?: string
  /** Names the row for assistive tech, e.g. "brands" → "Scroll brands left/right". */
  ariaLabel?: string
  /** Tailwind `from-*` color for the edge scrim behind the arrows. Defaults to the page background;
   *  rows sitting on a tinted panel pass a matching color so the fade blends into that panel. */
  scrimClass?: string
}

// A horizontal scroll track with overlaid prev/next arrows. The rails were swipe/scroll-only, which
// gives a mouse/keyboard visitor no signal that more content exists off-screen. The arrows appear
// only when there's actually somewhere to scroll in that direction (so a row that fits shows none),
// and only from md up — touch viewports keep the native swipe. Buttons are real, labelled controls
// so keyboard and screen-reader users get the same affordance.
export default function CarouselRow({ children, className = '', ariaLabel, scrimClass = 'from-background' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  // Scroll (no React render) and viewport resize both change what's reachable, so listen for them.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  // Re-measure after every render so late-loading data (which grows scrollWidth without firing a
  // scroll/resize event) flips the arrows on. Cheap: setState bails when the values are unchanged.
  useEffect(() => { update() })

  const scrollByViewport = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const arrowBase = 'hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-surface border border-outline-variant shadow-md text-on-surface hover:bg-surface-container transition-colors'

  return (
    <div className="relative">
      <div ref={ref} className={`flex overflow-x-auto scrollbar-hide ${className}`}>
        {children}
      </div>
      {canLeft && (
        <>
          {/* Scrim fades the outgoing card under the arrow instead of the arrow sitting on top of
              solid content. pointer-events-none keeps the underlying card scrollable/clickable. */}
          <div aria-hidden className={`hidden md:block pointer-events-none absolute left-0 top-0 bottom-0 z-[5] w-16 bg-gradient-to-r ${scrimClass} to-transparent`} />
          <button type="button" onClick={() => scrollByViewport(-1)}
            aria-label={ariaLabel ? `Scroll ${ariaLabel} left` : 'Scroll left'}
            className={`${arrowBase} left-1`}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chevron_left</span>
          </button>
        </>
      )}
      {canRight && (
        <>
          <div aria-hidden className={`hidden md:block pointer-events-none absolute right-0 top-0 bottom-0 z-[5] w-16 bg-gradient-to-l ${scrimClass} to-transparent`} />
          <button type="button" onClick={() => scrollByViewport(1)}
            aria-label={ariaLabel ? `Scroll ${ariaLabel} right` : 'Scroll right'}
            className={`${arrowBase} right-1`}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chevron_right</span>
          </button>
        </>
      )}
    </div>
  )
}
