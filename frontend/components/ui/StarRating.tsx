'use client'

import { useState } from 'react'

/**
 * Star ratings, display and input, in half steps.
 *
 * Ratings arrive from the API as decimal strings (DRF renders DecimalField that way), so every
 * value goes through Number() before it is compared against a threshold — `'4.5' >= 4` is a string
 * comparison and lies.
 */

const STARS = [1, 2, 3, 4, 5]

/** Averages are continuous (3.73), but a star can only be empty, half or full — snap to the step we can draw. */
function toHalfStep(value: number | string | null | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(5, Math.max(0, Math.round(n * 2) / 2))
}

/** Strips the trailing zero so 4.0 reads as "4" and 4.5 stays "4.5". */
export function formatRating(value: number | string | null | undefined): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 10) / 10)
}

/** "1 star", but "0.5 stars" and "4.5 stars" — only the whole number one takes the singular. */
function starLabel(value: number): string {
  const label = formatRating(value)
  return `${label} ${label === '1' ? 'star' : 'stars'}`
}

function glyphFor(position: number, value: number) {
  if (value >= position) return { icon: 'star', lit: true }
  if (value >= position - 0.5) return { icon: 'star_half', lit: true }
  return { icon: 'star', lit: false }
}

export function StarRating({
  value,
  size = 14,
  className = '',
}: {
  value: number | string | null | undefined
  size?: number
  className?: string
}) {
  const rounded = toHalfStep(value)
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${formatRating(rounded)} out of 5 stars`}>
      {STARS.map((n) => {
        const { icon, lit } = glyphFor(n, rounded)
        return (
          <span key={n} aria-hidden="true" style={{ fontSize: `${size}px` }}
            className={`material-symbols-outlined ${lit ? 'ms-filled text-rating' : 'text-outline-variant'}`}>
            {icon}
          </span>
        )
      })}
    </span>
  )
}

/**
 * Click the left half of a star for x.5, the right half for x.0. One tab stop, not ten: the halves
 * are pointer targets and the arrow keys move in 0.5 steps, which is also what a screen reader
 * announces through role="slider".
 */
export function StarRatingInput({
  value,
  onChange,
  size = 30,
  disabled = false,
  showValue = true,
  className = '',
}: {
  value: number | string | null | undefined
  onChange: (value: number) => void
  size?: number
  disabled?: boolean
  showValue?: boolean
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const current = toHalfStep(value)
  const shown = hover ?? current

  const step = (delta: number) => {
    const next = Math.min(5, Math.max(0.5, (current || 0) + delta))
    if (next !== current) onChange(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(0.5) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-0.5) }
    else if (e.key === 'Home') { e.preventDefault(); onChange(0.5) }
    else if (e.key === 'End') { e.preventDefault(); onChange(5) }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Rating"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={current || undefined}
        aria-valuetext={current ? `${formatRating(current)} out of 5 stars` : 'Not rated'}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
        className={`inline-flex items-center gap-0.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 ${disabled ? 'opacity-60' : ''}`}
      >
        {STARS.map((n) => {
          const { icon, lit } = glyphFor(n, shown)
          return (
            <span key={n} className="relative inline-flex">
              <span aria-hidden="true" style={{ fontSize: `${size}px` }}
                className={`material-symbols-outlined transition-colors ${lit ? 'ms-filled text-rating' : 'text-outline-variant'}`}>
                {icon}
              </span>
              {[n - 0.5, n].map((target, i) => (
                <button key={target} type="button" tabIndex={-1} disabled={disabled}
                  aria-label={starLabel(target)}
                  onClick={() => onChange(target)}
                  onMouseEnter={() => setHover(target)}
                  className={`absolute inset-y-0 w-1/2 ${i === 0 ? 'left-0' : 'right-0'} ${disabled ? 'cursor-default' : 'cursor-pointer'}`} />
              ))}
            </span>
          )
        })}
      </div>
      {showValue && (
        <span className="text-sm font-semibold text-on-surface-variant tabular-nums w-8">
          {current ? formatRating(current) : '—'}
        </span>
      )}
    </div>
  )
}
