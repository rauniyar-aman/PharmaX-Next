import Link from 'next/link'

// The "just hand us your prescription" banner: the reassurance that a customer doesn't have to find
// each medicine themselves — they upload the Rx and we source it, confirm the price, and deliver.
// It's the one solid brand-colour block on the home surface (the hero is photographic, the service
// tiles are pale tints), so it reads as a distinct, high-intent call to action rather than another
// card in the stack. The three steps are a genuine sequence, so a numbered/stepped treatment fits.
const STEPS = [
  { icon: 'upload_file', label: 'Upload your prescription' },
  { icon: 'medication', label: 'We source it & confirm the price' },
  { icon: 'local_shipping', label: 'Delivered to your door' },
]

export default function PrescriptionCTA() {
  return (
    <section>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-blue-800 px-6 py-8 sm:px-10 sm:py-10">
        {/* Oversized brand-subject watermark, clipped by the rounded corners, for a bit of texture. */}
        <span className="material-symbols-outlined ms-filled absolute -right-6 -bottom-8 text-white/10 select-none pointer-events-none" style={{ fontSize: '210px' }}>prescriptions</span>

        <div className="relative max-w-2xl">
          <h2 className="text-white text-2xl sm:text-3xl font-extrabold leading-tight">
            Upload your prescription and we&rsquo;ll do the rest
          </h2>
          <p className="text-white/85 text-sm sm:text-base mt-2.5 max-w-xl leading-snug">
            No hunting from pharmacy to pharmacy. Send us your prescription and we&rsquo;ll find the
            medicines, confirm the price with you, and deliver them to your door.
          </p>

          <ol className="flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-2.5 mt-5">
            {STEPS.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5 text-white/90 text-sm font-medium">
                <span className="relative w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{s.icon}</span>
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                </span>
                {s.label}
              </li>
            ))}
          </ol>

          <Link href="/prescriptions"
            className="group mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-primary shadow-md hover:gap-3 transition-all">
            <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>upload_file</span>
            Upload prescription
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
