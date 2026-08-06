'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Address } from '@/types'
import type { PickedLocation } from '@/components/map/MapPicker'

const MapPicker = dynamic(() => import('@/components/map/MapPicker'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface-container-low rounded-xl">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
})

const EMPTY_FORM = { label: 'Home', full_name: '', phone: '', address_line1: '', city: '', state: '', zip_code: '', is_default: false }

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/addresses/').then((r) => setAddresses(r.data.data.addresses || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAddForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setCoords(null)
    setShowMap(false)
    setShowForm(true)
  }

  const openEditForm = (addr: Address) => {
    setEditingId(addr.id)
    setForm({
      label: addr.label || 'Home',
      full_name: addr.full_name, phone: addr.phone,
      address_line1: addr.address_line1, city: addr.city, state: addr.state,
      zip_code: addr.zip_code || '', is_default: addr.is_default,
    })
    setCoords(addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : null)
    setShowMap(false)
    setShowForm(true)
  }

  const handleMapPick = (loc: PickedLocation) => {
    setCoords({ lat: loc.lat, lng: loc.lng })
    setForm((p: any) => ({
      ...p,
      address_line1: loc.address || p.address_line1,
      city: loc.city || p.city,
      state: loc.province || p.state,
      zip_code: loc.zip || p.zip_code,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = { ...form, lat: coords?.lat, lng: coords?.lng }
    try {
      if (editingId) {
        const res = await api.put(`/addresses/${editingId}/`, payload)
        setAddresses((prev) => {
          const updated = res.data.data.address
          const next = prev.map((a) => (a.id === editingId ? updated : a))
          return updated.is_default ? next.map((a) => (a.id === editingId ? a : { ...a, is_default: false })) : next
        })
        toast.success('Address updated!')
      } else {
        const res = await api.post('/addresses/', payload)
        const created = res.data.data.address
        setAddresses((prev) => [...prev, created].map((a) => (created.is_default && a.id !== created.id ? { ...a, is_default: false } : a)))
        toast.success('Address added!')
      }
      setShowForm(false)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save address.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await api.delete(`/addresses/${id}/`)
      setAddresses((prev) => prev.filter((a) => a.id !== id))
      toast.success('Address deleted.')
    } catch {
      toast.error('Failed to delete address.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    try {
      await api.put(`/addresses/${id}/`, { is_default: true })
      setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })))
      toast.success('Default address updated.')
    } catch {
      toast.error('Failed to update default address.')
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">My Addresses</h1>
        {!showForm && (
          <button onClick={openAddForm}
            className="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_location_alt</span>
            Add Address
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-outline-variant rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-on-surface">{editingId ? 'Edit Address' : 'New Address'}</p>
            <button type="button" onClick={() => setShowMap((s) => !s)}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>map</span>
              {showMap ? 'Hide map' : 'Pick on map'}
            </button>
          </div>

          {showMap && (
            <div className="h-64 rounded-xl overflow-hidden border border-outline-variant">
              <MapPicker value={coords} onChange={handleMapPick} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Label</label>
              <select value={form.label} onChange={(e) => setForm((p: any) => ({ ...p, label: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition">
                {['Home', 'Work', 'Other'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p: any) => ({ ...p, is_default: e.target.checked }))} className="accent-primary" />
                Set as default
              </label>
            </div>
          </div>

          {[
            { key: 'full_name', label: 'Full Name', required: true },
            { key: 'phone', label: 'Phone', required: true },
            { key: 'address_line1', label: 'Address', required: true },
            { key: 'city', label: 'City', required: true },
            { key: 'state', label: 'State / Province', required: true },
            { key: 'zip_code', label: 'ZIP / Postal Code (optional)', required: false },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
              <input type="text" required={f.required} value={form[f.key]}
                onChange={(e) => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          ))}

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Address'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 border border-outline-variant text-on-surface-variant text-sm rounded-xl hover:bg-surface-container transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-surface rounded-2xl border border-outline-variant animate-pulse" />)}</div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-outline-variant">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>location_off</span>
          <p className="text-base font-medium text-on-surface mt-3">No saved addresses</p>
          <p className="text-sm text-on-surface-variant mt-1">Add an address to speed up checkout</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className={`bg-surface rounded-2xl border p-4 ${addr.is_default ? 'border-primary' : 'border-outline-variant'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">{addr.label || 'Home'}</span>
                    {addr.is_default && <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Default</span>}
                    {addr.lat != null && <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '14px' }}>location_on</span>}
                  </div>
                  <p className="text-sm font-semibold text-on-surface mt-1">{addr.full_name}</p>
                  <p className="text-sm text-on-surface-variant">{addr.address_line1}</p>
                  <p className="text-sm text-on-surface-variant">{addr.city}, {addr.state} {addr.zip_code}</p>
                  <p className="text-sm text-on-surface-variant">{addr.phone}</p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex gap-1">
                    <button onClick={() => openEditForm(addr)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                    </button>
                    <button onClick={() => handleDelete(addr.id)} disabled={deletingId === addr.id}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 hover:text-error transition-colors text-on-surface-variant disabled:opacity-50">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{deletingId === addr.id ? 'progress_activity' : 'delete'}</span>
                    </button>
                  </div>
                  {!addr.is_default && (
                    <button onClick={() => handleSetDefault(addr.id)} className="text-[11px] text-primary font-medium hover:underline">
                      Set as default
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
