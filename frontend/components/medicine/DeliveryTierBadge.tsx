'use client'
import type { Medicine } from '@/types'

// Small pill that turns a medicine's location-aware `delivery_tier` into a customer-facing label:
// express (in the broadcast radius) vs same-day / 24hr (stocked farther out). Renders nothing when
// the tier is absent — i.e. the visitor hasn't shared a location, so the catalog is in browse mode.
export default function DeliveryTierBadge({ tier, className = '' }: { tier?: Medicine['delivery_tier']; className?: string }) {
  if (!tier) return null
  const express = tier === 'express'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${
        express ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
      } ${className}`}
    >
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '12px' }}>
        {express ? 'bolt' : 'schedule'}
      </span>
      {express ? 'Express' : 'Same-day'}
    </span>
  )
}
