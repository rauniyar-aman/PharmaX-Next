// Client-side mirror of the backend service-area gate (api/geo.py). Used ONLY for UI affordances —
// badging out-of-area addresses, disabling Book/Checkout early, live hints in the address form. The
// server re-checks authoritatively on every medicine/lab order (a bypassed UI still gets a 400), so
// this staying loosely in sync is acceptable. Doctor consultation is nationwide and never gated.
import api from '@/lib/api'

export interface ServiceCircle {
  label?: string
  lat: number
  lng: number
  radius_km: number
}

export interface ServiceAreaConfig {
  districts: string[]
  circles: ServiceCircle[]
}

// Kathmandu Valley — the ship-default the backend also falls back to when nothing is configured.
const FALLBACK: ServiceAreaConfig = { districts: ['Kathmandu', 'Lalitpur', 'Bhaktapur'], circles: [] }

let cache: ServiceAreaConfig | null = null
let inflight: Promise<ServiceAreaConfig> | null = null

// Fetch (and cache for the session) the serviceable-area config. Falls back to the valley default
// if the request fails, so the UI degrades to district-only rather than breaking.
export async function fetchServiceArea(force = false): Promise<ServiceAreaConfig> {
  if (cache && !force) return cache
  if (inflight && !force) return inflight
  inflight = api.get('/service-area/')
    .then((r) => {
      const d = r.data?.data || {}
      cache = {
        districts: Array.isArray(d.districts) && d.districts.length ? d.districts : FALLBACK.districts,
        circles: Array.isArray(d.circles) ? d.circles : [],
      }
      return cache
    })
    .catch(() => FALLBACK)
    .finally(() => { inflight = null })
  return inflight
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function pointInAnyCircle(lat: number, lng: number, circles: ServiceCircle[]): boolean {
  return circles.some((c) => {
    const clat = Number(c.lat), clng = Number(c.lng), r = Number(c.radius_km)
    if (!isFinite(clat) || !isFinite(clng) || !isFinite(r)) return false
    return haversineKm(lat, lng, clat, clng) <= r
  })
}

type ServiceableInput = { district?: string | null; lat?: number | null; lng?: number | null }

export interface ServiceableResult {
  ok: boolean
  // Which layer failed, so the UI can prompt the right fix (set district vs. drop a pin vs. just
  // out of range). 'ok' when serviceable.
  reason: 'ok' | 'district' | 'pin' | 'circle'
  message: string
}

// Mirrors api/geo.check_address_serviceable: district (coarse) → pin present → inside a circle.
export function isServiceable(address: ServiceableInput, config: ServiceAreaConfig): ServiceableResult {
  const serviceable = new Set(config.districts.map((d) => String(d).trim().toLowerCase()).filter(Boolean))
  const district = (address.district || '').trim()
  if (!district || !serviceable.has(district.toLowerCase())) {
    const names = config.districts.join(', ') || 'our service area'
    return { ok: false, reason: 'district', message: `Outside our service area — we currently serve ${names}.` }
  }
  if (address.lat == null || address.lng == null) {
    return { ok: false, reason: 'pin', message: 'Pin this address on the map to confirm it’s in our delivery area.' }
  }
  if (config.circles.length && !pointInAnyCircle(Number(address.lat), Number(address.lng), config.circles)) {
    return { ok: false, reason: 'circle', message: 'Just outside our current delivery zone — we’re expanding soon.' }
  }
  return { ok: true, reason: 'ok', message: '' }
}
