// A slim reassurance row under the hero — the trust cues every pharmacy storefront leads with
// (genuine stock, delivery, secure payment, licensing). Deliberately quiet: the hero carries the
// visual weight, so this stays a calm four-up strip of icon + label + one line of detail.
const ITEMS = [
  { icon: 'verified', label: '100% Genuine', detail: 'Sourced from licensed suppliers', color: 'text-emerald-600 dark:text-emerald-400' },
  { icon: 'local_shipping', label: 'Fast Delivery', detail: 'Same-day across the Valley', color: 'text-sky-600 dark:text-sky-400' },
  { icon: 'lock', label: 'Secure Payments', detail: 'eSewa, Khalti & cards', color: 'text-indigo-600 dark:text-indigo-400' },
  { icon: 'health_and_safety', label: 'Licensed Pharmacy', detail: 'Registered & regulated', color: 'text-primary' },
]

export default function TrustStrip() {
  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-3.5 py-3">
            <span className={`material-symbols-outlined ms-filled flex-shrink-0 ${it.color}`} style={{ fontSize: '26px' }}>{it.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface leading-tight truncate">{it.label}</p>
              <p className="text-[11px] text-on-surface-variant leading-tight truncate">{it.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
