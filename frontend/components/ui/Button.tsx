import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

const variants = {
  primary:   'bg-primary text-on-primary hover:bg-primary-dark',
  secondary: 'bg-secondary-container text-on-secondary-container hover:opacity-90',
  outline:   'border border-outline-variant text-on-surface hover:bg-surface-container',
  ghost:     'text-on-surface-variant hover:bg-surface-container',
  danger:    'bg-error text-on-error hover:opacity-90',
}

const sizes = {
  sm: 'px-4 py-2 text-xs rounded-xl',
  md: 'px-5 py-2.5 text-sm rounded-2xl',
  lg: 'px-6 py-3 text-sm rounded-2xl',
}

export default function Button({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
