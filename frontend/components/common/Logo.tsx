import Image from 'next/image'

interface Props {
  iconSize?: number
  iconSizeClassName?: string
  textClassName?: string
  className?: string
  showText?: boolean
}

/** Swasthaya brand mark — the provided logo artwork (house + medical cross + leaf).
 * Rendered from the supplied raster so it matches the brand file exactly. Pass `sizeClassName`
 * (Tailwind h-/w- utilities) for a responsive size that differs per breakpoint; otherwise the
 * numeric `size` sets a fixed square. */
export function SwasthayaIcon({ size = 36, sizeClassName, className = '' }: { size?: number; sizeClassName?: string; className?: string }) {
  return (
    <Image src="/swasthaya-logo_cut.jpg" alt="Swasthaya" width={472} height={389} priority
      className={`flex-shrink-0 rounded-lg object-contain ${sizeClassName || ''} ${className}`}
      style={sizeClassName ? undefined : { height: size, width: size }} />
  )
}

export default function Logo({ iconSize = 36, iconSizeClassName, textClassName = 'text-xl', className = '', showText = true }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SwasthayaIcon size={iconSize} sizeClassName={iconSizeClassName} />
      {showText && (
        <span className={`font-display font-bold tracking-tight leading-none text-primary ${textClassName}`}>
          Swasthaya
        </span>
      )}
    </span>
  )
}
