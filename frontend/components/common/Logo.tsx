import Image from 'next/image'

interface Props {
  iconSize?: number
  textClassName?: string
  className?: string
}

export default function Logo({ iconSize = 36, textClassName = 'text-xl', className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Image src="/PharmaX_Icon.png" alt="" width={iconSize} height={iconSize} style={{ height: iconSize, width: iconSize }} className="flex-shrink-0" />
      <span className={`font-extrabold tracking-tight leading-none text-on-surface ${textClassName}`}>
        Pharma<span className="text-primary">X</span>
      </span>
    </span>
  )
}
