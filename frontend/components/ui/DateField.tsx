'use client'
import type { InputHTMLAttributes } from 'react'

/**
 * A date input whose calendar opens from anywhere in the field, not only from the small icon at
 * its right edge. Everything else is the caller's — styling, `min`, `value`, `onChange` — so this
 * drops into an existing form without changing how it looks.
 *
 * `showPicker()` requires a user gesture, which a click is. The optional call covers browsers that
 * don't implement it (they still have the icon), and the try/catch covers the click that landed on
 * the icon itself, where the browser is already opening the picker. Bound to click rather than
 * focus on purpose: opening on focus would ambush anyone tabbing through the form.
 */
export default function DateField({ onClick, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="date"
      onClick={(e) => {
        onClick?.(e)
        try {
          e.currentTarget.showPicker?.()
        } catch {
          /* unsupported, or the browser is already showing it */
        }
      }}
    />
  )
}
