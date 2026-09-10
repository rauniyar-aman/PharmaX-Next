import Image from 'next/image'

interface Props {
  iconSize?: number
  textClassName?: string
  className?: string
  showText?: boolean
}

/** Swasthaya brand mark — the provided logo artwork (house + medical cross + leaf).
 * Rendered from the supplied raster so it matches the brand file exactly. */
export function SwasthayaIcon({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <Image src="/swasthaya-logo_cut.jpg" alt="Swasthaya" width={472} height={389} priority
      className={`flex-shrink-0 rounded-lg object-contain ${className}`}
      style={{ height: size, width: size }} />
  )
}

export default function Logo({ iconSize = 36, textClassName = 'text-xl', className = '', showText = true }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SwasthayaIcon size={iconSize} />
      {showText && (
        <span className={`font-display font-bold tracking-tight leading-none text-primary ${textClassName}`}>
          Swasthaya
        </span>
      )}
    </span>
  )
}
