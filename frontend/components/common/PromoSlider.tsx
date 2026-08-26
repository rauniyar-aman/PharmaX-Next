'use client'
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
}

export default function PromoSlider({ slides }: Props) {
  if (slides.length === 0) return null

  return (
    <div className="max-w-[1120px] mx-auto">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {slides.map((slide, i) => {
          const image = resolveImg(slide.image_url)
          return (
            <Link key={i} href={slide.href}
              className={`relative w-72 sm:w-80 md:w-[356px] flex-shrink-0 aspect-[2/1] rounded-2xl overflow-hidden px-6 py-7 sm:px-8 sm:py-7 flex items-center justify-between gap-4 ${image ? '' : `bg-gradient-to-r ${slide.gradient}`}`}>
              {image && (
                <>
                  <img src={image} alt={slide.title} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30" />
                </>
              )}
              <div className="relative max-w-[75%]">
                <p className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-1">{slide.title}</p>
                <p className="text-xs sm:text-sm text-white/85 mt-1 leading-relaxed line-clamp-2">{slide.subtitle}</p>
                <span className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-white text-gray-900 text-xs font-bold rounded-xl">
                  {slide.cta}
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_forward</span>
                </span>
              </div>
              {!image && (
                <span className="relative material-symbols-outlined ms-filled text-white/25 hidden sm:block flex-shrink-0" style={{ fontSize: '64px' }}>
                  {slide.icon}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
