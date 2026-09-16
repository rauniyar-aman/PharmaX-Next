import Link from 'next/link'

// The two lead value-props on the home surface, side by side: "hand us your prescription" and
// "skip the hospital — consult, test, and get medicines all from home". They sit in a 2-up grid so
// neither runs the full width of the page (a single full-bleed block left a lot of dead space on
// wide screens). Two brand hues — navy for the prescription offer, green for the care offer — keep
// them reading as two distinct offers rather than one repeated block.
//
// Prescription is a genuine step-by-step flow, so it's numbered. The care card lists three parallel
// capabilities ("all in one"), not an ordered sequence, so it uses plain icon bullets instead.
const RX_STEPS = [
  { icon: 'upload_file', label: 'Upload your prescription' },
  { icon: 'medication', label: 'We source it & confirm the price' },
  { icon: 'local_shipping', label: 'Delivered to your door' },
]

const CARE_POINTS = [
  { icon: 'video_call', label: 'Consult a doctor online' },
  { icon: 'biotech', label: 'Lab samples collected at home' },
  { icon: 'local_shipping', label: 'Medicines delivered to your door' },
]

export default function CarePromo() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Prescription — navy */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-blue-800 px-6 py-7 sm:px-8 sm:py-8 flex flex-col">
        <span className="material-symbols-outlined ms-filled absolute -right-5 -bottom-6 text-white/10 select-none pointer-events-none" style={{ fontSize: '160px' }}>prescriptions</span>
        <div className="relative flex flex-col h-full">
          <h2 className="text-white text-xl sm:text-2xl font-extrabold leading-tight">
            Upload your prescription and we&rsquo;ll do the rest
          </h2>
          <p className="text-white/85 text-sm mt-2 max-w-sm leading-snug">
            No hunting from pharmacy to pharmacy. We find the medicines, confirm the price with you, and deliver them to your door.
          </p>
          <ol className="flex flex-col gap-2 mt-4">
            {RX_STEPS.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5 text-white/90 text-sm font-medium">
                <span className="relative w-7 h-7 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{s.icon}</span>
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white text-primary text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                </span>
                {s.label}
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-6">
            <Link href="/prescriptions"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary shadow-md hover:gap-3 transition-all">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>upload_file</span>
              Upload prescription
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Consult + lab + delivery, all from home — green */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-7 sm:px-8 sm:py-8 flex flex-col">
        <span className="material-symbols-outlined ms-filled absolute -right-5 -bottom-6 text-white/10 select-none pointer-events-none" style={{ fontSize: '160px' }}>health_and_safety</span>
        <div className="relative flex flex-col h-full">
          <h2 className="text-white text-xl sm:text-2xl font-extrabold leading-tight">
            Skip the hospital trip
          </h2>
          <p className="text-white/85 text-sm mt-2 max-w-sm leading-snug">
            Consult a doctor online, get your lab samples collected at home, and have your medicines delivered to your door. All in one place.
          </p>
          <ul className="flex flex-col gap-2 mt-4">
            {CARE_POINTS.map((p) => (
              <li key={p.label} className="flex items-center gap-2.5 text-white/90 text-sm font-medium">
                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{p.icon}</span>
                </span>
                {p.label}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6 flex flex-wrap gap-2.5">
            <Link href="/doctor-consult"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 shadow-md hover:gap-3 transition-all">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>stethoscope</span>
              Consult a doctor
            </Link>
            <Link href="/lab-tests"
              className="inline-flex items-center gap-2 rounded-full border border-white/70 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>biotech</span>
              Book a lab test
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
