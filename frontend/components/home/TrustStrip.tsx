// A slim reassurance row under the hero — the trust cues every pharmacy storefront leads with
// (genuine stock, delivery, secure payment, licensing). It reads as one strip attached to the hero
// rather than four separate cards, and it's monochrome on purpose: green now means *your* state
// (a dose taken, an order delivered), so spending it on a marketing claim would dilute it.
const ITEMS = [
  { icon: 'verified', label: '100% Genuine', detail: 'Sourced from licensed suppliers' },
  { icon: 'local_shipping', label: 'Fast Delivery', detail: 'Same-day across the Valley' },
  { icon: 'payments', label: 'Cash on Delivery', detail: 'Online payment accepted' },
  { icon: 'health_and_safety', label: 'Licensed Pharmacy', detail: 'Registered & regulated' },
]

export default function TrustStrip() {
  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant rounded-2xl border border-outline-variant overflow-hidden">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-3 bg-surface px-3.5 py-3">
            <span className="material-symbols-outlined ms-filled flex-shrink-0 text-primary" style={{ fontSize: '24px' }}>{it.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface leading-tight">{it.label}</p>
              {/* Two-up on a phone leaves ~120px per cell, which clipped every one of these to
                  "Sourced from lice…". A half-read reassurance reassures nobody, so the detail
                  waits for the width that can hold it — the labels alone carry the point. */}
              <p className="hidden sm:block text-[11px] text-on-surface-variant leading-tight truncate">{it.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
