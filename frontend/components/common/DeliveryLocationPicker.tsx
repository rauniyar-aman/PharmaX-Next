'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useLocationStore } from '@/store/location'
import type { Address } from '@/types'

interface Suggestion { label: string; lat: number; lng: number }

function shortLabel(displayName: string) {
  const parts = displayName.split(',').map((p) => p.trim())
  return parts.slice(0, 2).join(', ')
}

export default function DeliveryLocationPicker() {
  const user = useAuthStore((s) => s.user)
  const { label, setLocation } = useLocationStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [autoTried, setAutoTried] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
      .then((r) => r.json())
      .then((data) => setLocation({ label: shortLabel(data?.display_name || 'Current Location'), lat, lng }))
      .catch(() => {})
  }, [setLocation])

  // Best-effort silent auto-detect on first visit, only if nothing saved yet.
  useEffect(() => {
    if (label || autoTried || typeof window === 'undefined' || !navigator.geolocation) return
    setAutoTried(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => reverseGeocode(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { timeout: 8000 },
    )
  }, [label, autoTried, reverseGeocode])

  useEffect(() => {
    if (!open || !user) return
    api.get('/addresses/').then((r) => setAddresses(r.data.data.addresses || [])).catch(() => {})
  }, [open, user])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=np&q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data) => setSuggestions((data || []).map((d: any) => ({ label: shortLabel(d.display_name), lat: Number(d.lat), lng: Number(d.lon) }))))
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false))
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return
    setDetecting(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        setDetecting(false)
        setOpen(false)
      },
      () => setDetecting(false),
      { timeout: 8000 },
    )
  }

  const pickSuggestion = (s: Suggestion) => {
    setLocation({ label: s.label, lat: s.lat, lng: s.lng })
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  const pickAddress = (a: Address) => {
    setLocation({ label: `${a.city}${a.state ? ', ' + a.state : ''}`, lat: a.lat ?? undefined, lng: a.lng ?? undefined })
    setOpen(false)
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-left rounded-xl px-2 py-1.5 hover:bg-surface-container transition-colors">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>location_on</span>
        <div className="hidden sm:block">
          <p className="text-[10px] text-on-surface-variant leading-none">Delivery to</p>
          <p className="text-xs font-semibold text-on-surface leading-tight mt-0.5 max-w-[140px] truncate">
            {label || 'Select Location'}
          </p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>expand_more</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-12 w-80 bg-surface border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="p-4 space-y-3">
              <p className="text-sm font-bold text-on-surface">Choose your delivery location</p>
              <button onClick={handleUseMyLocation} disabled={detecting}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-colors disabled:opacity-60">
                <span className={`material-symbols-outlined ${detecting ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>
                  {detecting ? 'progress_activity' : 'my_location'}
                </span>
                {detecting ? 'Detecting…' : 'Use my current location'}
              </button>

              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search area, city..."
                  className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
              </div>

              {searching && <p className="text-xs text-on-surface-variant">Searching…</p>}
              {suggestions.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => pickSuggestion(s)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>place</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {user && addresses.length > 0 && (
                <div className="pt-2 border-t border-outline-variant space-y-1">
                  <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Saved Addresses</p>
                  {addresses.map((a) => (
                    <button key={a.id} onClick={() => pickAddress(a)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>
                        {a.label === 'Work' ? 'work' : 'home'}
                      </span>
                      <span className="truncate">{a.label} — {a.city}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
