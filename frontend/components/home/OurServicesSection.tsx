'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import CarouselRow from '@/components/common/CarouselRow'
import type { LabTest, Doctor, BlogPost } from '@/types'

// This section used to be three near-identical rails that led with lab-test names, doctor names,
// and article titles. It's now merchandising-first: lab tests lead with the *saving* (discount %),
// packages lead with their *value* (amount saved + tests included), and doctors are entered by
// *specialty tiles* — a graphic grid — with only a short "top doctors" row keeping the named cards.

function discountPct(price: string | number, original: string | number) {
  const p = Number(price), o = Number(original)
  return o > p && o > 0 ? Math.round(((o - p) / o) * 100) : 0
}

function ScrollGroup({ title, subtitle, viewAllHref, loading, empty, emptyText = 'Nothing here yet.', children }: {
  title: string; subtitle?: string; viewAllHref: string; loading: boolean; empty: boolean; emptyText?: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-on-surface">{title}</h3>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        <Link href={viewAllHref} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 ml-auto flex-shrink-0">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel={title}
        scrimClass="from-[color-mix(in_srgb,rgb(var(--c-primary))_5%,rgb(var(--c-background)))]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)
        ) : empty ? (
          <p className="text-sm text-on-surface-variant py-4">{emptyText}</p>
        ) : children}
      </CarouselRow>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 animate-pulse space-y-3">
      <div className="h-4 bg-surface-container rounded w-3/4" />
      <div className="h-3 bg-surface-container rounded w-1/2" />
      <div className="h-8 bg-surface-container rounded mt-2" />
    </div>
  )
}

// ---- Popular lab tests: the discount is the lead, not the name ------------------------------
function LabTestCard({ t }: { t: LabTest }) {
  const off = discountPct(t.price, t.original_price)
  return (
    <Link href={`/lab-tests/${t.id}`}
      className="w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>science</span>
        </div>
        {off > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-error/10 text-error">{off}% OFF</span>}
      </div>
      <p className="text-sm font-semibold text-on-surface leading-snug mt-3 flex-1 line-clamp-2">{t.name}</p>
      <p className="text-xs text-on-surface-variant mt-1">{t.category_name}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-sm font-bold text-on-surface">NPR {Number(t.price).toFixed(0)}</span>
        {off > 0 && <span className="text-[10px] text-on-surface-variant line-through">NPR {Number(t.original_price).toFixed(0)}</span>}
      </div>
      <span className="btn btn-sm btn-primary w-full mt-3">Book test<span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span></span>
    </Link>
  )
}

// ---- Value packages: the amount saved + tests included is the lead ---------------------------
function PackageCard({ t }: { t: LabTest }) {
  const off = discountPct(t.price, t.original_price)
  const saved = Math.max(0, Number(t.original_price) - Number(t.price))
  const count = t.included_tests?.length || 0
  return (
    <Link href={`/lab-tests/${t.id}`}
      className="w-56 flex-shrink-0 rounded-2xl border border-primary/25 bg-primary/5 p-4 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-primary/15 text-primary">
          <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>inventory_2</span>
          Package
        </span>
        {off > 0 && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-error/10 text-error">Save {off}%</span>}
      </div>
      <p className="text-sm font-semibold text-on-surface leading-snug mt-3 line-clamp-2">{t.name}</p>
      <p className="text-xs text-on-surface-variant mt-1 flex-1">{count > 0 ? `${count} tests included` : 'Multi-test package'}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-base font-bold text-on-surface">NPR {Number(t.price).toFixed(0)}</span>
        {off > 0 && <span className="text-[10px] text-on-surface-variant line-through">NPR {Number(t.original_price).toFixed(0)}</span>}
      </div>
      {saved > 0 && <p className="text-[11px] font-semibold text-primary mt-0.5">You save NPR {saved.toFixed(0)}</p>}
      <span className="btn btn-sm btn-primary w-full mt-3">View package<span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span></span>
    </Link>
  )
}

// ---- Consult by specialty: a graphic grid instead of a list of doctor names ------------------
function specialtyIcon(name: string): string {
  const s = name.toLowerCase()
  if (s.includes('cardio')) return 'cardiology'
  if (s.includes('derma') || s.includes('skin')) return 'dermatology'
  if (s.includes('pediatr') || s.includes('child')) return 'child_care'
  if (s.includes('gyne') || s.includes('obstet')) return 'pregnant_woman'
  if (s.includes('psych') || s.includes('mental')) return 'psychology'
  if (s.includes('dent')) return 'dentistry'
  if (s.includes('orthop') || s.includes('bone')) return 'orthopedics'
  if (s.includes('ent') || s.includes('ear')) return 'hearing'
  if (s.includes('ophthal') || s.includes('eye')) return 'ophthalmology'
  if (s.includes('neuro')) return 'neurology'
  if (s.includes('gastro')) return 'gastroenterology'
  if (s.includes('diabet') || s.includes('endocr')) return 'glucose'
  if (s.includes('pulmo') || s.includes('lung') || s.includes('chest')) return 'pulmonology'
  return 'stethoscope'
}

export default function OurServicesSection() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [packages, setPackages] = useState<LabTest[]>([])
  const [specialties, setSpecialties] = useState<string[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [testsLoading, setTestsLoading] = useState(true)
  const [pkgLoading, setPkgLoading] = useState(true)
  const [docsLoading, setDocsLoading] = useState(true)
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => {
    // Popular tests (packages filtered out so the two lab rails stay distinct)
    api.get('/lab-tests/', { params: { sortBy: 'popular', limit: 12 } })
      .then((r) => setTests((r.data.data.labTests || []).filter((t: LabTest) => !t.is_package)))
      .catch(() => {}).finally(() => setTestsLoading(false))
    // Value packages via the same isPackage filter the catalog page uses
    api.get('/lab-tests/', { params: { sortBy: 'popular', isPackage: 'true', limit: 10 } })
      .then((r) => setPackages(r.data.data.labTests || []))
      .catch(() => {}).finally(() => setPkgLoading(false))
    // Specialties (authoritative list) + a short "top doctors" sample
    api.get('/doctors/specialties/').then((r) => setSpecialties(r.data.data.specialties || [])).catch(() => {})
    api.get('/doctors/', { params: { sortBy: 'popular' } })
      .then((r) => setDoctors((r.data.data.doctors || []).slice(0, 8)))
      .catch(() => {}).finally(() => setDocsLoading(false))
    api.get('/blog/', { params: { limit: 8 } })
      .then((r) => setPosts(r.data.data.posts || []))
      .catch(() => {}).finally(() => setPostsLoading(false))
  }, [])

  const allLoaded = !testsLoading && !pkgLoading && !docsLoading && !postsLoading
  if (allLoaded && tests.length === 0 && packages.length === 0 && doctors.length === 0 && posts.length === 0) return null

  return (
    <section className="bg-primary/5 rounded-xl p-5 sm:p-6">
      <div className="mb-8">
        <h2 className="font-display text-lg font-semibold text-on-surface">Beyond medicines</h2>
        <p className="text-xs text-on-surface-variant mt-0.5">Lab tests with home collection, bundled health packages, and video consults with certified doctors.</p>
      </div>

      <div className="space-y-8">
        <ScrollGroup title="Popular Lab Tests" subtitle="Home sample collection, certified labs" viewAllHref="/lab-tests" loading={testsLoading} empty={tests.length === 0}>
          {tests.map((t) => <LabTestCard key={t.id} t={t} />)}
        </ScrollGroup>

        {(pkgLoading || packages.length > 0) && (
          <ScrollGroup title="Value Test Packages" subtitle="Bundled tests at a lower price" viewAllHref="/lab-tests?packages=1" loading={pkgLoading} empty={packages.length === 0}>
            {packages.map((t) => <PackageCard key={t.id} t={t} />)}
          </ScrollGroup>
        )}

        {/* Consult by specialty — the graphic entry point. Doctor names are demoted to a short row. */}
        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-on-surface">Consult by Specialty</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Video consult a certified doctor from anywhere in Nepal</p>
            </div>
            <Link href="/doctor-consult" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 ml-auto flex-shrink-0">
              View All<span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
            </Link>
          </div>

          {specialties.length > 0 && (
            <CarouselRow className="gap-3 pb-1 -mx-1 px-1 mb-4" ariaLabel="specialties"
              scrimClass="from-[color-mix(in_srgb,rgb(var(--c-primary))_5%,rgb(var(--c-background)))]">
              {specialties.slice(0, 12).map((s) => (
                <Link key={s} href={`/doctor-consult?specialty=${encodeURIComponent(s)}`}
                  className="flex flex-col items-center gap-2 w-24 flex-shrink-0 group">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '30px' }}>{specialtyIcon(s)}</span>
                  </div>
                  <span className="text-[11px] font-medium text-on-surface text-center leading-snug line-clamp-2">{s}</span>
                </Link>
              ))}
            </CarouselRow>
          )}

          {/* Short "top doctors" strip — a few faces, not a long list of names */}
          {!docsLoading && doctors.length > 0 && (
            <CarouselRow className="gap-3 pb-1 -mx-1 px-1" ariaLabel="top doctors"
              scrimClass="from-[color-mix(in_srgb,rgb(var(--c-primary))_5%,rgb(var(--c-background)))]">
              {doctors.map((d) => (
                <Link key={d.id} href={`/doctor-consult/${d.id}`}
                  className="flex items-center gap-3 w-64 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-3 hover:-translate-y-0.5 hover:shadow-md transition-all">
                  <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {d.photo_url
                      ? <img src={resolveImg(d.photo_url) || undefined} alt="" className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>person</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">Dr. {d.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{d.specialty}</p>
                  </div>
                  <span className="text-xs font-bold text-primary flex-shrink-0">NPR {Number(d.consultation_fee).toFixed(0)}</span>
                </Link>
              ))}
            </CarouselRow>
          )}
        </div>

        <ScrollGroup title="Health Articles" subtitle="Guidance from our medical team" viewAllHref="/health-articles" loading={postsLoading} empty={posts.length === 0}>
          {posts.map((p) => (
            <Link key={p.id} href={`/health-articles/${p.slug}`}
              className="w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant overflow-hidden flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              <div className="h-28 w-full bg-primary/10 flex items-center justify-center text-primary/40 overflow-hidden">
                {p.cover_image_url
                  ? <img src={resolveImg(p.cover_image_url) || undefined} alt={p.title} className="w-full h-full object-cover" />
                  : <span className="material-symbols-outlined ms-filled" style={{ fontSize: '32px' }}>article</span>}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2">{p.title}</p>
                {p.category && <p className="text-xs text-on-surface-variant mt-1 flex-1">{p.category}</p>}
                <span className="btn btn-sm btn-primary w-full mt-auto">Read article<span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span></span>
              </div>
            </Link>
          ))}
        </ScrollGroup>
      </div>
    </section>
  )
}
