// Curated demo photography bundled at /public/demo (Pexels licence — free commercial use, no
// attribution required). The local/demo seed data ships without product images, so a catalogue card
// with an empty `image_url` would fall back to a bare icon and the storefront reads as "unfinished".
// productPhoto() gives every product a topical, on-brand photo keyed off its category/name, so the
// demo looks like a real e-commerce catalogue. A real uploaded `image_url` ALWAYS wins — these only
// fill the gap, and nothing here is referenced by production data.

const TABLETS = ['/demo/med-tablets.jpg', '/demo/med-capsules.jpg']
const SKINCARE = ['/demo/med-skincare.jpg', '/demo/med-derma.jpg']
const VITAMINS = ['/demo/med-vitamins.jpg', '/demo/med-supplements.jpg']
const BABY = ['/demo/med-baby.jpg']
const DEVICE = ['/demo/med-device.jpg']
const LAB = ['/demo/med-lab.jpg']

// keyword → photo pool, tested in order (first match wins). More specific buckets come first so a
// "baby skin cream" reads as baby, not generic skincare. Everything unmatched falls back to tablets.
const BUCKETS: { test: RegExp; pool: string[] }[] = [
  { test: /baby|infant|mother|child|pediatric|diaper|formula|nappy/, pool: BABY },
  { test: /skin|derma|cosmetic|face|hair|beauty|lotion|cream|moistur|serum|sunscreen|soap/, pool: SKINCARE },
  { test: /vitamin|supplement|nutrition|mineral|protein|omega|calcium|immun|wellness|tonic|herbal/, pool: VITAMINS },
  { test: /device|monitor|equipment|thermomet|oximeter|glucomet|pressure|nebuli|machine|surgical/, pool: DEVICE },
  { test: /lab|diagnostic|reagent|sample/, pool: LAB },
]

// Small stable hash so a given product always resolves to the same photo (no flicker between
// renders) while different products spread across each pool for visual variety.
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

interface PhotoInput {
  id?: string
  name?: string
  category_name?: string
  category?: { name?: string } | null
  dosage_form?: string | null
  generic_name?: string | null
}

export function productPhoto(med: PhotoInput): string {
  const hay = [med.category_name, med.category?.name, med.name, med.dosage_form, med.generic_name]
    .filter(Boolean).join(' ').toLowerCase()
  const pool = BUCKETS.find((b) => b.test.test(hay))?.pool || TABLETS
  return pool[hash(med.id || hay || 'x') % pool.length]
}

export function categoryPhoto(name: string): string {
  return productPhoto({ id: name, category_name: name })
}

// Wide 1200×450 lead photos for the homepage/dashboard hero banner.
export const HERO_PHOTOS = ['/demo/hero-1.jpg', '/demo/hero-2.jpg', '/demo/hero-3.jpg', '/demo/hero-4.jpg']
