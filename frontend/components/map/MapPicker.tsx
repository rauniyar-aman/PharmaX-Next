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

      {!marker && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none z-[1000]">
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
