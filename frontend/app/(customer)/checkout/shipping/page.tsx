'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Address } from '@/types'
import type { PickedLocation } from '@/components/map/MapPicker'
import { NEPAL_PROVINCES, guessDistrictFromText } from '@/lib/nepalDistricts'
import { fetchServiceArea, isServiceable, type ServiceAreaConfig } from '@/lib/serviceArea'

const MapPicker = dynamic(() => import('@/components/map/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

export default function CheckoutShippingPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', address_line1: '', address_line2: '', city: '', state: '', district: '', is_default: false })
  const [notes, setNotes] = useState('')
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [svcArea, setSvcArea] = useState<ServiceAreaConfig | null>(null)

  useEffect(() => { fetchServiceArea().then(setSvcArea).catch(() => {}) }, [])

  // Autofill the recipient phone from the signed-in user's account (editable) when the add form is
  // opened, so the customer needn't re-type their own mobile.
  const prefillOwnPhone = () =>
    setForm((p) => ({ ...p, phone: p.phone || ((user as any)?.phone || '').replace(/\D/g, '').slice(-10) }))
  const openAddressForm = () => { prefillOwnPhone(); setShowForm(true) }

  const handleMapPick = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng })
    const guessed = guessDistrictFromText(loc.address, loc.city, loc.province)
    setForm((p) => ({
      ...p,
      address_line1: loc.address || p.address_line1,
      city: loc.city || p.city,
      state: loc.province || p.state,
      district: p.district || guessed,
    }))
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation is not supported by your browser.'); return }
    prefillOwnPhone()
    setShowForm(true)
    setShowMap(true)
    setDetectingLocation(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
          const data = await res.json()
          const addr = data?.address || {}
          handleMapPick({
            lat, lng,
            address: data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            city: addr.city || addr.town || addr.village || addr.municipality || '',
            province: addr.state || addr.province || '',
            zip: addr.postcode || '',
          })
        } catch {
          handleMapPick({ lat, lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, city: '', province: '', zip: '' })
        } finally {
          setDetectingLocation(false)
        }
      },
      () => {
        setDetectingLocation(false)
        toast.error('Could not get your location. Please allow location access or pick on the map.')
      },
      { timeout: 8000 },
    )
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('checkoutAllowed')) {
      router.replace('/cart')
    }
  }, [])

  useEffect(() => {
    api.get('/addresses/').then((r) => {
      const addrs = r.data.data.addresses || []
      setAddresses(addrs)
      const def = addrs.find((a: Address) => a.is_default)
      if (def) setSelected(def.id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!coords) { toast.error('Please pin this address on the map so we can confirm delivery.'); setShowMap(true); return }
    setSaving(true)
    try {
      const res = await api.post('/addresses/', { ...form, lat: coords.lat, lng: coords.lng })
      const newAddr = res.data.data.address
      setAddresses((p) => [...p, newAddr])
      setSelected(newAddr.id)
      setShowForm(false)
      setShowMap(false)
      setCoords(null)
      setForm({ full_name: '', phone: '', address_line1: '', address_line2: '', city: '', state: '', district: '', is_default: false })
    } catch {
      toast.error('Failed to save address.')
    } finally {
      setSaving(false)
    }
  }

  const handleContinue = () => {
    if (!selected) { toast.error('Please select a delivery address.'); return }
    // Belt-and-suspenders with the server gate: block clearly out-of-area addresses here with the
    // reason, so the customer fixes it before the broadcast step rather than after a 400.
    const addr = addresses.find((a) => a.id === selected)
    if (svcArea && addr) {
      const r = isServiceable(addr, svcArea)
      if (!r.ok) { toast.error(r.message); return }
    }
    sessionStorage.setItem('checkoutAddress', selected)
    sessionStorage.setItem('checkoutNotes', notes)
    router.push('/checkout/broadcasting')
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  // The prescription step (if this order needs one) already happened before Shipping — see the
  // cart page and the medicine detail page's handleBuyNow(), which route Rx checkouts there first
  // and set this flag so later steps can still number themselves correctly.
  const hasRx = typeof window !== 'undefined' && sessionStorage.getItem('checkoutHasRx') === '1'

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        {hasRx && (
          <>
            <span className="text-on-surface font-medium">1. Prescription</span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
          </>
        )}
        <span className="font-semibold text-primary">{hasRx ? '2' : '1'}. Shipping</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>{hasRx ? '3' : '2'}. Availability</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>{hasRx ? '4' : '3'}. Payment</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span>{hasRx ? '5' : '4'}. Confirm</span>
      </div>

      <h1 className="text-2xl font-bold text-on-surface">Delivery Address</h1>

      <div className="space-y-3">
        {addresses.map((addr) => {
          const svc = svcArea ? isServiceable(addr, svcArea) : null
          return (
            <label key={addr.id} className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-colors ${selected === addr.id ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface hover:border-primary/40'}`}>
              <input type="radio" name="address" value={addr.id} checked={selected === addr.id} onChange={() => setSelected(addr.id)} className="mt-1 accent-primary" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-on-surface">{addr.full_name}</p>
                  {svc && !svc.ok && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Outside delivery area</span>}
                </div>
                <p className="text-sm text-on-surface-variant">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                <p className="text-sm text-on-surface-variant">{addr.city}, {addr.state}</p>
                <p className="text-sm text-on-surface-variant">{addr.phone}</p>
                {addr.is_default && <span className="text-xs font-medium text-primary">Default</span>}
                {svc && !svc.ok && <p className="text-[11px] text-amber-700 mt-1">{svc.message}</p>}
              </div>
            </label>
          )
        })}

        {!showForm ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={openAddressForm}
              className="flex-1 py-3 border-2 border-dashed border-outline-variant rounded-2xl text-sm font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_location_alt</span>
              Add New Address
            </button>
            <button onClick={handleUseCurrentLocation} disabled={detectingLocation}
              className="flex-1 py-3 border-2 border-dashed border-primary/30 rounded-2xl text-sm font-medium text-primary hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              <span className={`material-symbols-outlined ${detectingLocation ? 'animate-spin' : ''}`} style={{ fontSize: '18px' }}>
                {detectingLocation ? 'progress_activity' : 'my_location'}
              </span>
              {detectingLocation ? 'Detecting…' : 'Use Current Location'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleAddAddress} className="bg-surface border border-outline-variant rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-on-surface">New Address</p>
              <button type="button" onClick={() => setShowMap((s) => !s)}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>map</span>
                {showMap ? 'Hide map' : 'Pick on map'}
              </button>
            </div>
            {showMap && (
              <div className="h-56 rounded-xl overflow-hidden border border-outline-variant">
                <MapPicker value={coords} onChange={handleMapPick} />
              </div>
            )}
            {[
              { key: 'full_name', label: 'Full Name', required: true },
              { key: 'phone', label: 'Phone', required: true },
              { key: 'address_line1', label: 'Address Line 1', required: true },
              { key: 'address_line2', label: 'Address Line 2 (optional)', required: false },
              { key: 'city', label: 'City', required: true },
              { key: 'state', label: 'State / Province', required: true },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
                <input type="text" required={f.required} value={(form as any)[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-on-surface-variant">District</label>
              <select required value={form.district}
                onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition">
                <option value="">Select your district</option>
                {NEPAL_PROVINCES.map((prov) => (
                  <optgroup key={prov.name} label={`${prov.name} Province`}>
                    {prov.districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </optgroup>
                ))}
              </select>
              {!coords && (
                <p className="mt-1 text-[11px] text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>info</span>
                  Pin your location on the map — required to confirm delivery.
                </p>
              )}
            </div>
            {svcArea && form.district && coords && (() => {
              const r = isServiceable({ district: form.district, lat: coords.lat, lng: coords.lng }, svcArea)
              return (
                <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${r.ok ? 'bg-primary/5 text-primary' : 'bg-amber-50 text-amber-700'}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{r.ok ? 'check_circle' : 'info'}</span>
                  <span>{r.ok ? 'We deliver to this address.' : r.message}</span>
                </div>
              )
            })()}
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} className="accent-primary" />
              Set as default address
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Address'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 border border-outline-variant text-on-surface-variant text-sm rounded-xl hover:bg-surface-container transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-on-surface-variant">Order Notes (optional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Any special instructions for delivery..."
          className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
      </div>

      <button onClick={handleContinue} disabled={!selected}
        className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60">
        Continue
      </button>
    </div>
  )
}
