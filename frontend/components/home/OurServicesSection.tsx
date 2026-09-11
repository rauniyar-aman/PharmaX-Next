'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import CarouselRow from '@/components/common/CarouselRow'
import type { LabTest, Doctor, BlogPost } from '@/types'

// Same card shell and accent for all three services — the whole point of this section is that Lab
// Tests / Doctor Consult / Health Articles read as one family instead of three independently-
// styled rails, so every tile shares size, shape, and color regardless of which service it's for.
const CARD_CLASS = 'w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200'
const ICON_BADGE = 'w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 overflow-hidden'
// Doctors get a larger *circular* avatar (a face, not an abstract service glyph) so a real
// headshot reads as a person and the consult card is visually distinct from the lab-test and
// article tiles that share the squared ICON_BADGE.
const DOCTOR_AVATAR = 'w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 overflow-hidden'
// Health-article tiles are image-forward: a full-bleed cover banner sits flush at the card top, so
// (unlike the icon-badge Lab/Doctor cards) they carry no outer p-4 — the banner spans edge to edge
// and the text below gets its own padded block. overflow-hidden keeps the banner inside the radius.
const ARTICLE_CARD_CLASS = 'w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant overflow-hidden flex flex-col hover:-translate-y-1 hover:shadow-md transition-all duration-200'

// The whole card is a <Link>, so the action affordance is a styled span, not a nested <button>
// (invalid inside an <a>). It reuses the site's .btn tokens for a full-width filled pill — a real
// button-strength affordance rather than a small text link — and mt-auto pins it to the card foot.
function CardCta({ label }: { label: string }) {
  return (
    <span className="btn btn-sm btn-primary w-full mt-auto">
      {label}
      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
    </span>
  )
}

function ServiceCardSkeleton() {
  return (
    <div className="w-48 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant p-4 animate-pulse space-y-3">
      <div className="w-10 h-10 rounded-xl bg-surface-container" />
      <div className="h-4 bg-surface-container rounded w-3/4" />
      <div className="h-3 bg-surface-container rounded w-1/2" />
    </div>
  )
}

// Each hook below fetches from the exact same endpoint/params the original standalone
// LabTestRail/DoctorRail/HealthArticlesRail components used — only the rendering is consolidated,
// not the data-fetching.
function useLabTests() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/lab-tests/', { params: { sortBy: 'popular', limit: 10 } })
      .then((r) => setTests(r.data.data.labTests || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  return { tests, loading }
}

function useDoctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/doctors/', { params: { sortBy: 'popular' } })
      .then((r) => setDoctors((r.data.data.doctors || []).slice(0, 10)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  return { doctors, loading }
}

function useHealthArticles() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/blog/', { params: { limit: 8 } }).then((r) => setPosts(r.data.data.posts || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])
  return { posts, loading }
}

function ServiceGroup({ title, viewAllHref, loading, empty, children }: {
  title: string
  viewAllHref: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        <Link href={viewAllHref} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      {/* Scrim matches this section's bg-primary/5 panel (primary at 5% over background) so the
          arrow fade blends into the panel, not the page background. color-mix keeps it theme-safe. */}
      <CarouselRow className="gap-4 pb-1 -mx-1 px-1" ariaLabel={title}
        scrimClass="from-[color-mix(in_srgb,rgb(var(--c-primary))_5%,rgb(var(--c-background)))]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <ServiceCardSkeleton key={i} />)
        ) : empty ? (
          <p className="text-sm text-on-surface-variant py-4">Nothing here yet.</p>
        ) : children}
      </CarouselRow>
    </div>
  )
}

export default function OurServicesSection() {
  const { tests, loading: testsLoading } = useLabTests()
  const { doctors, loading: doctorsLoading } = useDoctors()
  const { posts, loading: postsLoading } = useHealthArticles()

  const allLoaded = !testsLoading && !doctorsLoading && !postsLoading
  if (allLoaded && tests.length === 0 && doctors.length === 0 && posts.length === 0) return null

  return (
    <section className="bg-primary/5 rounded-xl p-5 sm:p-6">
      {/* Intro gets more breathing room (mb-8) than the 24px between rails below, so the section
          heading reads as a level above the rail headings instead of sitting equally spaced. */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-on-surface">Our Services</h2>
        <p className="text-xs text-on-surface-variant mt-0.5">More than a medicine store — lab tests, doctor consults, and health guidance, all in one place.</p>
      </div>

      <div className="space-y-6">
      <ServiceGroup title="Lab Tests at Home" viewAllHref="/lab-tests" loading={testsLoading} empty={tests.length === 0}>
        {tests.map((t) => {
          const discount = Number(t.original_price) > Number(t.price)
            ? Math.round(((Number(t.original_price) - Number(t.price)) / Number(t.original_price)) * 100)
            : 0
          return (
            <Link key={t.id} href={`/lab-tests/${t.id}`} className={CARD_CLASS}>
              <div className={ICON_BADGE}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>biotech</span>
              </div>
              <p className="text-sm font-semibold text-on-surface leading-snug mt-3 flex-1 line-clamp-2">{t.name}</p>
              <p className="text-xs text-on-surface-variant mt-1">{t.category_name}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-sm font-bold text-primary">NPR {Number(t.price).toFixed(0)}</span>
                {discount > 0 && <span className="text-[10px] text-on-surface-variant line-through">NPR {Number(t.original_price).toFixed(0)}</span>}
              </div>
              <CardCta label="Book test" />
            </Link>
          )
        })}
      </ServiceGroup>

      <ServiceGroup title="Consult a Doctor" viewAllHref="/doctor-consult" loading={doctorsLoading} empty={doctors.length === 0}>
        {doctors.map((d) => (
          <Link key={d.id} href={`/doctor-consult/${d.id}`} className={CARD_CLASS}>
            <div className={DOCTOR_AVATAR}>
              {d.photo_url ? (
                <img src={resolveImg(d.photo_url) || undefined} alt={`Dr. ${d.name}`} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>person</span>
              )}
            </div>
            <p className="text-sm font-semibold text-on-surface leading-snug mt-3">Dr. {d.name}</p>
            <p className="text-xs text-on-surface-variant mt-1 flex-1">{d.specialty}</p>
            <p className="text-sm font-bold text-primary mt-2">NPR {Number(d.consultation_fee).toFixed(0)}</p>
            <CardCta label="Consult" />
          </Link>
        ))}
      </ServiceGroup>

      <ServiceGroup title="Health Articles" viewAllHref="/health-articles" loading={postsLoading} empty={posts.length === 0}>
        {posts.map((p) => (
          <Link key={p.id} href={`/health-articles/${p.slug}`} className={ARTICLE_CARD_CLASS}>
            <div className="h-28 w-full bg-primary/10 flex items-center justify-center text-primary/40 overflow-hidden">
              {p.cover_image_url ? (
                <img src={resolveImg(p.cover_image_url) || undefined} alt={p.title} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '32px' }}>article</span>
              )}
            </div>
            <div className="p-4 flex flex-col flex-1">
              {/* Title first, then category below in grey sentence-case — matches every other card
                  (was a blue ALL-CAPS category sitting above the title, the reverse of the others). */}
              <p className="text-sm font-semibold text-on-surface leading-snug line-clamp-2">{p.title}</p>
              {p.category && <p className="text-xs text-on-surface-variant mt-1 flex-1">{p.category}</p>}
              <CardCta label="Read article" />
            </div>
          </Link>
        ))}
      </ServiceGroup>
      </div>
    </section>
  )
}
