import Link from 'next/link'

// The two lead value-props on the home surface, side by side: "hand us your prescription" and
// "skip the hospital — consult, test, and get medicines all from home". They sit in a 2-up grid so
// neither runs the full width of the page (a single full-bleed block left a lot of dead space on
// wide screens). Two brand hues — navy for the prescription offer, green for the care offer — keep
// them reading as two distinct offers rather than one repeated block.
//
// Prescription is a genuine step-by-step flow, so it's numbered. The care card lists three parallel
// capabilities ("all in one"), not an ordered sequence, so it uses plain icon bullets instead.
//
// The two panels are the only places in the app that hardcode a hex. They have to: these are fixed
// saturated surfaces carrying white text, and `--color-primary` / `--color-secondary` inverse to
// *light* blue and *light* green in dark mode (globals.css `.dark`), which would put white text on
// a pale panel. The previous code sidestepped that with blue-800/emerald-600/teal-700 — safe, but
// four hues that aren't the brand's. These are the brand's own navy and green, darkened for the
// gradient's far end. Don't "fix" them into tokens.
const NAVY = '#003B7A'
const NAVY_DEEP = '#002C5C'
const GREEN = '#00A86B'
const GREEN_DEEP = '#00794D'

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
      <div className="relative overflow-hidden rounded-3xl px-6 py-7 sm:px-8 sm:py-8 flex flex-col"
        style={{ backgroundImage: `linear-gradient(to bottom right, ${NAVY}, ${NAVY_DEEP})` }}>
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
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white text-[10px] font-bold flex items-center justify-center" style={{ color: NAVY }}>{i + 1}</span>
                </span>
                {s.label}
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-6">
            <Link href="/prescriptions"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-md hover:gap-3 transition-all"
              style={{ color: NAVY }}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>upload_file</span>
              Upload prescription
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Consult + lab + delivery, all from home — green */}
      <div className="relative overflow-hidden rounded-3xl px-6 py-7 sm:px-8 sm:py-8 flex flex-col"
        style={{ backgroundImage: `linear-gradient(to bottom right, ${GREEN}, ${GREEN_DEEP})` }}>
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
              className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-md hover:gap-3 transition-all"
              style={{ color: GREEN_DEEP }}>
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
