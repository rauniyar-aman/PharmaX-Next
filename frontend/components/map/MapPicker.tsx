'use client'
import { useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Bundlers break Leaflet's default marker asset paths — repoint at the package's own CDN-hosted images.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER: [number, number] = [27.7172, 85.324] // Kathmandu

export interface PickedLocation {
  lat: number
  lng: number
  address: string
  city: string
  province: string
  zip: string
}

interface Props {
  value?: { lat: number; lng: number } | null
  onChange: (loc: PickedLocation) => void
}

interface SearchResult {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap()
  if (position) map.flyTo(position, Math.max(map.getZoom(), 15))
  return null
}

export default function MapPicker({ value, onChange }: Props) {
  const [marker, setMarker] = useState<[number, number] | null>(value?.lat ? [value.lat, value.lng] : null)
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const requestId = useRef(0)

  // Forward-geocode search (type an address → locate it), complementing click-to-pin and My
  // Location. Nominatim asks for ≤1 req/sec, so we search on submit (Enter / button), never per keystroke.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const id = ++requestId.current
    setLoadingAddress(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
      const data = await res.json()
      if (id !== requestId.current) return
      const addr = data?.address || {}
      onChange({
        lat, lng,
        address: data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        city: addr.city || addr.town || addr.village || addr.municipality || '',
        province: addr.state || addr.province || '',
        zip: addr.postcode || '',
      })
    } catch {
      onChange({ lat, lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, city: '', province: '', zip: '' })
    } finally {
      if (id === requestId.current) setLoadingAddress(false)
    }
  }, [onChange])

  const handlePick = useCallback((lat: number, lng: number) => {
    setMarker([lat, lng])
    reverseGeocode(lat, lng)
  }, [reverseGeocode])

  const handleMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setMarker([lat, lng])
      setFlyTarget([lat, lng])
      reverseGeocode(lat, lng)
    })
  }

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearched(true)
    try {
      // countrycodes=np keeps results relevant to this Nepal-only storefront (map defaults to Kathmandu).
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=np&limit=5&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [query])

  const selectResult = (r: SearchResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setMarker([lat, lng])
    setFlyTarget([lat, lng])
    const addr = r.address || {}
    onChange({
      lat, lng,
      address: r.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      city: addr.city || addr.town || addr.village || addr.municipality || '',
      province: addr.state || addr.province || '',
      zip: addr.postcode || '',
    })
    setResults([])
    setSearched(false)
    setQuery(r.display_name.split(',').slice(0, 2).join(',').trim())
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer center={marker || DEFAULT_CENTER} zoom={marker ? 16 : 13} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={handlePick} />
        <FlyTo position={flyTarget} />
        {marker && <Marker position={marker} />}
      </MapContainer>

      {/* Text address search (forward geocode) — pinned over the map, works in both address forms */}
      <div className="absolute top-2 left-2 right-2 z-[1000]">
        <div className="flex gap-1.5">
          <div className="flex-1 relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
              placeholder="Search an address or place…"
              className="w-full pl-8 pr-3 py-2 rounded-full bg-surface/95 backdrop-blur-sm border border-outline-variant text-xs text-on-surface placeholder:text-on-surface-variant shadow-sm focus:outline-none focus:border-primary"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '16px' }}>search</span>
          </div>
          <button type="button" onClick={runSearch} disabled={searching || !query.trim()}
            className="px-3 rounded-full bg-primary text-on-primary text-xs font-semibold shadow-sm disabled:opacity-60">
            {searching ? '…' : 'Search'}
          </button>
        </div>

        {searched && (
          <div className="mt-1.5 bg-surface rounded-xl border border-outline-variant shadow-lg overflow-hidden max-h-44 overflow-y-auto">
            {searching ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: '14px' }}>progress_activity</span>
                Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant">No matches. Try a different search, or drop a pin on the map.</div>
            ) : (
              results.map((r, i) => (
                <button key={i} type="button" onClick={() => selectResult(r)}
                  className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-surface-container border-b border-outline-variant last:border-0 flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-primary flex-shrink-0" style={{ fontSize: '14px' }}>location_on</span>
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {!marker && !searched && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none z-[999]">
          Click anywhere on the map to drop a pin
        </div>
      )}

      <button type="button" onClick={handleMyLocation}
        className="absolute bottom-4 right-4 w-10 h-10 bg-surface rounded-full shadow-lg flex items-center justify-center hover:bg-surface-container-low transition-colors border border-outline-variant z-[1000]">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>my_location</span>
      </button>

      {loadingAddress && (
        <div className="absolute bottom-4 left-4 bg-surface/90 backdrop-blur-sm text-on-surface text-xs px-3 py-1.5 rounded-full border border-outline-variant flex items-center gap-1.5 z-[1000]">
          <span className="material-symbols-outlined animate-spin text-primary" style={{ fontSize: '14px' }}>progress_activity</span>
          Getting address…
        </div>
      )}

      {marker && !loadingAddress && (
        <div className="absolute bottom-4 left-4 bg-primary/90 backdrop-blur-sm text-on-primary text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 z-[1000]">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>location_on</span>
          Pin dropped — move to adjust
        </div>
      )}
    </div>
  )
}
