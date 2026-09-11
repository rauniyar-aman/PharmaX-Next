'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { NEPAL_PROVINCES } from '@/lib/nepalDistricts'
import type { PickedLocation } from '@/components/map/MapPicker'

const MapPicker = dynamic(() => import('@/components/map/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

// Editor row for a coverage circle — kept as strings while typing, converted to numbers on save.
type CircleRow = { label: string; lat: string; lng: string; radius_km: string }
const VALLEY_DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur']

const SETTINGS_GROUPS = [
  {
    title: 'Store Settings',
    fields: [
      { key: 'store_name', label: 'Store Name', placeholder: 'Swasthaya' },
      { key: 'support_email', label: 'Support Email', placeholder: 'support@pharmax.com' },
      { key: 'support_phone', label: 'Support Phone', placeholder: '+977 9800000000' },
      { key: 'free_delivery_threshold', label: 'Free Delivery Threshold (NPR)', placeholder: '500' },
      { key: 'delivery_charge', label: 'Standard Delivery Charge (NPR)', placeholder: '50' },
      { key: 'low_stock_threshold', label: 'Low Stock Threshold (units)', placeholder: '10' },
    ],
  },
  {
    title: 'Matching & Delivery',
    fields: [
      { key: 'broadcast_radius_km', label: 'Broadcast Radius (km)', placeholder: '3' },
      { key: 'broadcast_window_minutes', label: 'Broadcast Window (minutes)', placeholder: '10' },
      { key: 'priority_window_seconds', label: 'Full-Coverage Priority Window (seconds)', placeholder: '30' },
    ],
  },
  {
    title: 'Uploads',
    fields: [
      { key: 'document_max_size_mb', label: 'Max Document Size (MB)', placeholder: '5' },
    ],
  },
  {
    title: 'Tracking',
    fields: [
      { key: 'eta_assumed_speed_kmh', label: 'Assumed Rider Speed for ETA (km/h)', placeholder: '20' },
    ],
  },
]

export default function AdminSettingsPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  // Service Area (super-admin): the two JSON settings the delivery/lab gate reads. Consultation is
  // nationwide and unaffected.
  const [saDistricts, setSaDistricts] = useState<string[]>([])
  const [saCircles, setSaCircles] = useState<CircleRow[]>([])
  const [savingSvc, setSavingSvc] = useState(false)
  const [mapRowIdx, setMapRowIdx] = useState<number | null>(null)
  const saInitRef = useRef(false)

  useEffect(() => {
    if (user && !user.is_super_admin) router.replace('/admin/dashboard')
  }, [user, router])

  useEffect(() => {
    if (!user?.is_super_admin) return
    api.get('/admin/settings/').then((r) => setSettings(r.data.data.settings || {})).catch(() => {}).finally(() => setSettingsLoading(false))
  }, [user])

  // Seed the Service Area editor from the loaded settings once — later re-saves of `settings` from
  // the general form must not clobber edits in progress here.
  useEffect(() => {
    if (saInitRef.current || settingsLoading) return
    saInitRef.current = true
    try {
      const d = JSON.parse(settings.serviceable_districts || '[]')
      setSaDistricts(Array.isArray(d) && d.length ? d : VALLEY_DISTRICTS)
    } catch { setSaDistricts(VALLEY_DISTRICTS) }
    try {
      const c = JSON.parse(settings.service_area_circles || '[]')
      setSaCircles(Array.isArray(c) ? c.map((x: any) => ({
        label: String(x?.label ?? ''),
        lat: x?.lat != null ? String(x.lat) : '',
        lng: x?.lng != null ? String(x.lng) : '',
        radius_km: x?.radius_km != null ? String(x.radius_km) : '',
      })) : [])
    } catch { setSaCircles([]) }
  }, [settingsLoading, settings])

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await api.put('/admin/settings/', settings)
      setSettings(res.data.data.settings || settings)
      toast.success('Settings saved!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  const addDistrict = (d: string) => { if (d && !saDistricts.includes(d)) setSaDistricts((p) => [...p, d]) }
  const removeDistrict = (d: string) => setSaDistricts((p) => p.filter((x) => x !== d))
  const addCircle = () => setSaCircles((p) => [...p, { label: '', lat: '', lng: '', radius_km: '5' }])
  const removeCircle = (i: number) => { setSaCircles((p) => p.filter((_, k) => k !== i)); setMapRowIdx((m) => (m === i ? null : m)) }
  const updateCircle = (i: number, patch: Partial<CircleRow>) => setSaCircles((p) => p.map((c, k) => (k === i ? { ...c, ...patch } : c)))

  const handleServiceAreaSave = async () => {
    setSavingSvc(true)
    try {
      // Only persist complete circles (numeric center + positive radius) so a half-filled row can't
      // silently shrink coverage. An empty list ⇒ district-only gating, which is valid.
      const cleanCircles = saCircles
        .map((c) => ({ label: c.label.trim(), lat: Number(c.lat), lng: Number(c.lng), radius_km: Number(c.radius_km) }))
        .filter((c) => isFinite(c.lat) && isFinite(c.lng) && isFinite(c.radius_km) && c.radius_km > 0)
      const res = await api.put('/admin/settings/', {
        serviceable_districts: JSON.stringify(saDistricts),
        service_area_circles: JSON.stringify(cleanCircles),
      })
      setSettings((prev) => ({ ...prev, ...(res.data.data.settings || {}) }))
      setSaCircles(cleanCircles.map((c) => ({ label: c.label, lat: String(c.lat), lng: String(c.lng), radius_km: String(c.radius_km) })))
      setMapRowIdx(null)
      toast.success('Service area saved!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save service area.')
    } finally {
      setSavingSvc(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) { toast.error('Passwords do not match.'); return }
    if (passwords.new_password.length < 8) { toast.error('Password must be at least 8 characters.'); return }
    setPwLoading(true)
    try {
      await api.post('/auth/change-password/', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      })
      toast.success('Password changed!')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  if (!user?.is_super_admin) return null

  return (
    <div className="max-w-lg space-y-5">
      {settingsLoading ? (
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <form onSubmit={handleSettingsSave} className="space-y-5">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.title} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
              <h2 className="text-sm font-bold text-on-surface">{group.title}</h2>
              <div className="space-y-3">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
                    <input type="text" value={settings[f.key] || ''} placeholder={f.placeholder}
                      onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button type="submit" disabled={savingSettings}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {savingSettings ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Settings'}
          </button>
        </form>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-on-surface">Service Area</h2>
          <p className="text-xs text-on-surface-variant mt-1">Where medicine delivery and home lab collection are offered. Doctor consultations stay available across Nepal regardless of this.</p>
        </div>

        {settingsLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl animate-pulse" />)}</div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-on-surface">Serviceable districts</label>
              <div className="flex flex-wrap gap-1.5">
                {saDistricts.length === 0
                  ? <span className="text-xs text-amber-700">No districts selected — delivery and lab collection are effectively closed.</span>
                  : saDistricts.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 pl-2.5 pr-1.5 py-1 rounded-full">
                      {d}
                      <button type="button" onClick={() => removeDistrict(d)} aria-label={`Remove ${d}`} className="text-primary/70 hover:text-error flex">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </span>
                  ))}
              </div>
              <select value="" onChange={(e) => { addDistrict(e.target.value); e.currentTarget.value = '' }}
                className="w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="">+ Add a district…</option>
                {NEPAL_PROVINCES.map((prov) => {
                  const avail = prov.districts.filter((d) => !saDistricts.includes(d))
                  return avail.length ? (
                    <optgroup key={prov.name} label={`${prov.name} Province`}>
                      {avail.map((d) => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  ) : null
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-on-surface">Coverage zones</label>
              <p className="text-[11px] text-on-surface-variant">A pinned delivery/collection location must fall inside at least one zone. Leave empty to allow anywhere within the serviceable districts.</p>
              <div className="space-y-2.5">
                {saCircles.map((c, i) => (
                  <div key={i} className="rounded-xl border border-outline-variant p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={c.label} onChange={(e) => updateCircle(i, { label: e.target.value })} placeholder="Zone label (e.g. Central Kathmandu)"
                        className="flex-1 px-3 py-2 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                      <button type="button" onClick={() => removeCircle(i)} aria-label="Remove zone"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" step="any" value={c.lat} onChange={(e) => updateCircle(i, { lat: e.target.value })} placeholder="Latitude"
                        className="px-3 py-2 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                      <input type="number" step="any" value={c.lng} onChange={(e) => updateCircle(i, { lng: e.target.value })} placeholder="Longitude"
                        className="px-3 py-2 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                      <input type="number" step="any" min="0" value={c.radius_km} onChange={(e) => updateCircle(i, { radius_km: e.target.value })} placeholder="Radius km"
                        className="px-3 py-2 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                    </div>
                    <button type="button" onClick={() => setMapRowIdx(mapRowIdx === i ? null : i)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>map</span>
                      {mapRowIdx === i ? 'Hide map' : 'Set center on map'}
                    </button>
                    {mapRowIdx === i && (
                      <div className="h-56 rounded-xl overflow-hidden border border-outline-variant">
                        <MapPicker
                          value={c.lat && c.lng ? { lat: Number(c.lat), lng: Number(c.lng) } : null}
                          onChange={(loc: PickedLocation) => updateCircle(i, { lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6) })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCircle}
                className="w-full py-2.5 border-2 border-dashed border-outline-variant rounded-xl text-xs font-semibold text-on-surface-variant hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span>
                Add coverage zone
              </button>
            </div>

            <button type="button" onClick={handleServiceAreaSave} disabled={savingSvc}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
              {savingSvc ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Service Area'}
            </button>
          </>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <h2 className="text-sm font-bold text-on-surface">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {[
            { key: 'current_password', label: 'Current Password' },
            { key: 'new_password', label: 'New Password' },
            { key: 'confirm', label: 'Confirm New Password' },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
              <input type="password" value={(passwords as any)[f.key]}
                onChange={(e) => setPasswords((p) => ({ ...p, [f.key]: e.target.value }))} required
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          ))}
          <button type="submit" disabled={pwLoading}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {pwLoading ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <h2 className="text-sm font-bold text-on-surface">Session</h2>
        <p className="text-xs text-on-surface-variant">Sign out from your admin session.</p>
        <button onClick={() => { logout(); router.push('/') }}
          className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
          Sign Out
        </button>
      </div>
    </div>
  )
}
