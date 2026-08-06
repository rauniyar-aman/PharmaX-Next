const STATS = [
  { icon: 'group', value: '50,000+', label: 'Happy Customers' },
  { icon: 'local_shipping', value: '1,20,000+', label: 'Orders Delivered' },
  { icon: 'medication', value: '5,000+', label: 'Medicines Available' },
  { icon: 'location_on', value: '25+', label: 'Cities Served' },
]

export default function StatsBar() {
  return (
    <section className="bg-surface rounded-2xl border border-outline-variant p-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{s.icon}</span>
            </div>
            <p className="text-lg font-bold text-on-surface">{s.value}</p>
            <p className="text-xs text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
