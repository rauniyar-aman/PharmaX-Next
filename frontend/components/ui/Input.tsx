import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  right?: ReactNode
  error?: string
  /** Fixed, non-editable text shown inside the field before the input (e.g. a country code). */
  prefix?: string
}

export default function Input({ label, icon, right, error, prefix, className = '', ...props }: Props) {
  const leftPad = icon && prefix ? 'pl-[5.75rem]' : icon ? 'pl-12' : prefix ? 'pl-16' : ''
  return (
    <label className="block text-sm text-on-surface-variant">
      {label && <div className="mb-2 font-medium">{label}</div>}
      <div className="relative">
        {icon && (
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            {icon}
          </div>
        )}
        {prefix && (
          <div className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-on-surface font-medium ${icon ? 'left-11' : 'left-4'}`}>
            {prefix}
          </div>
        )}
        <input
          className={`w-full rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 ${leftPad} ${right ? 'pr-14' : ''} ${error ? 'border-error' : ''} ${className}`}
          {...props}
        />
        {right && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant">
            {right}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </label>
  )
}
