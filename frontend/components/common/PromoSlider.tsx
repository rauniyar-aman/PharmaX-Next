'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { resolveImg } from '@/lib/resolveImg'

export interface Slide {
  title: string
  subtitle: string
  cta: string
  href: string
  icon: string
  gradient: string
  image_url?: string | null
}

interface Props {
  slides: Slide[]
  intervalMs?: number
}

export default function PromoSlider({ slides, intervalMs = 5000 }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback((i: number) => {
    setIndex(((i % slides.length) + slides.length) % slides.length)
  }, [slides.length])

  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  useEffect(() => {
    if (paused || slides.length <= 1) return
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), intervalMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [paused, slides.length, intervalMs])

  if (slides.length === 0) return null

  return (
    <div className="max-w-[1200px] mx-auto">
      <div
        className="relative rounded-2xl overflow-hidden group"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((slide, i) => {
            const image = resolveImg(slide.image_url)
            return (
              <Link key={i} href={slide.href}
                className={`relative w-full aspect-square flex-shrink-0 px-6 py-7 sm:px-10 sm:py-9 flex items-center justify-between gap-6 overflow-hidden ${image ? '' : `bg-gradient-to-r ${slide.gradient}`}`}>
                {image && (
                  <>
                    <img src={image} alt={slide.title} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30" />
                  </>
                )}
                <div className="relative max-w-md">
                  <p className="text-lg sm:text-xl font-bold text-white leading-snug">{slide.title}</p>
                  <p className="text-sm text-white/85 mt-1.5 leading-relaxed">{slide.subtitle}</p>
                  <span className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-white text-gray-900 text-xs font-bold rounded-xl">
                    {slide.cta}
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
                  </span>
                </div>
                {!image && (
                  <span className="relative material-symbols-outlined ms-filled text-white/25 hidden sm:block flex-shrink-0" style={{ fontSize: '96px' }}>
                    {slide.icon}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {slides.length > 1 && (
          <>
            <button onClick={prev} aria-label="Previous slide"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
            </button>
            <button onClick={next} aria-label="Next slide"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {slides.map((_, i) => (
                <button key={i} onClick={() => goTo(i)} aria-label={`Go to slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
