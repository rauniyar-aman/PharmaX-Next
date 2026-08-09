'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Same fix as MapPicker — bundlers break Leaflet's default marker asset paths.
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// A small colored div-icon for the rider, distinct from the default blue pin used for the
// destination — no extra image asset/CDN needed, just an inline styled div.
const riderIcon = L.divIcon({
  className: '',
  html: '<div style="background:#16a34a;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid white;"><span class="material-symbols-outlined ms-filled" style="color:white;font-size:18px;line-height:1;">sports_motorsports</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const DEFAULT_CENTER: [number, number] = [27.7172, 85.324] // Kathmandu

interface LatLng {
  lat: number
  lng: number
}

interface Props {
  riderPosition: LatLng | null
  destination: LatLng | null
}

/** Re-fits the map to whatever points are currently available every time they change — the
 * rider's position moves on each poll, so this needs to re-run on every prop update, not just
 * on mount (unlike MapPicker's FlyTo, which only reacts to explicit user picks). */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.fitBounds(points, { padding: [40, 40] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)])
  return null
}

/** Read-only tracking display — no click-to-pick, no reverse geocoding, no "use my location".
 * Deliberately separate from MapPicker: that component's whole shape is built around picking and
 * confirming ONE address; this one just plots up to two fixed points (rider + destination) and
 * re-centers as the rider moves. Both reuse the same react-leaflet/leaflet setup. */
export default function LiveTrackingMap({ riderPosition, destination }: Props) {
  const points: [number, number][] = []
  if (riderPosition) points.push([riderPosition.lat, riderPosition.lng])
  if (destination) points.push([destination.lat, destination.lng])
  const center = points[0] || DEFAULT_CENTER

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {riderPosition && <Marker position={[riderPosition.lat, riderPosition.lng]} icon={riderIcon} />}
        {destination && <Marker position={[destination.lat, destination.lng]} />}
      </MapContainer>
    </div>
  )
}
