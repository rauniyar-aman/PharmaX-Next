'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PickedLocation } from '@/components/map/MapPicker'

const MapPicker = dynamic(() => import('@/components/map/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

export default function AddPharmacyPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', license_number: '', address: '' })
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleMapPick = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng })
    setForm((p) => ({ ...p, address: loc.address || p.address }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!coords) { toast.error('Pick the pharmacy\'s location on the map — riders need it to find the pickup point.'); return }
    setSaving(true)
    try {
      await api.post('/admin/pharmacies/', { ...form, lat: coords.lat, lng: coords.lng })
      toast.success('Pharmacy created! Verify it before it can receive orders.')
      router.push('/admin/pharmacies')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to create pharmacy.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/pharmacies" className="hover:text-primary transition-colors">Pharmacies</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Pharmacy</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Pharmacy</h1>
      <p className="text-sm text-on-surface-variant">
        Creates a login account for the pharmacy. It starts unverified — verify it from the pharmacy list once you've confirmed the license.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Pharmacy Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">License Number *</label>
              <input type="text" required value={form.license_number} onChange={(e) => setForm((p) => ({ ...p, license_number: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Login Email *</label>
              <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Phone *</label>
              <input type="text" required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">Temporary Password *</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
          <p className="text-sm font-bold text-on-surface">Pickup Location *</p>
          <p className="text-xs text-on-surface-variant">This is where riders pick up orders from — pin it precisely.</p>
          <div className="h-64 rounded-xl overflow-hidden border border-outline-variant">
            <MapPicker value={coords} onChange={handleMapPick} />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Address</label>
            <textarea required rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          {coords && <p className="text-xs text-on-surface-variant">Pinned at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Create Pharmacy'}
          </button>
          <Link href="/admin/pharmacies" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
