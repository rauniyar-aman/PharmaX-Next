'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyListing, Medicine } from '@/types'

function todayPlusYear() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export default function PharmacyInventoryPage() {
  const [tab, setTab] = useState<'listings' | 'catalog'>('listings')

  // My Listings
  const [listings, setListings] = useState<PharmacyListing[]>([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [edits, setEdits] = useState<Record<string, { stock_quantity: string; expiry_date: string; is_available: boolean }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  // Browse catalog
  const [catalog, setCatalog] = useState<Medicine[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState<{ stock_quantity: string; expiry_date: string } | null>(null)

  const loadListings = useCallback(() => {
    setLoadingListings(true)
    api.get('/pharmacy/listings/').then((r) => {
      const data: PharmacyListing[] = r.data.data.listings || []
      setListings(data)
      const e: typeof edits = {}
      data.forEach((l) => { e[l.id] = { stock_quantity: String(l.stock_quantity), expiry_date: l.expiry_date, is_available: l.is_available } })
      setEdits(e)
    }).catch(() => toast.error('Failed to load your listings.')).finally(() => setLoadingListings(false))
  }, [])

  useEffect(() => { loadListings() }, [loadListings])

  useEffect(() => {
    if (tab !== 'catalog') return
    setLoadingCatalog(true)
    const t = setTimeout(() => {
      api.get('/pharmacy/medicines/', { params: { search: catalogSearch, limit: 30 } })
        .then((r) => setCatalog(r.data.data.medicines || []))
        .catch(() => toast.error('Failed to load medicine catalog.'))
        .finally(() => setLoadingCatalog(false))
    }, 300)
    return () => clearTimeout(t)
  }, [tab, catalogSearch])

  const listedMedicineIds = new Set(listings.map((l) => l.medicine_id))

  const saveListing = async (id: string) => {
    const e = edits[id]
    const qty = Number(e.stock_quantity)
    if (isNaN(qty) || qty < 0) { toast.error('Invalid stock quantity.'); return }
    if (!e.expiry_date) { toast.error('Expiry date is required.'); return }
    setSavingId(id)
    try {
      const res = await api.patch(`/pharmacy/listings/${id}/`, { stock_quantity: qty, expiry_date: e.expiry_date, is_available: e.is_available })
      setListings((prev) => prev.map((l) => (l.id === id ? res.data.data.listing : l)))
      toast.success('Listing updated.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update listing.')
    } finally {
      setSavingId(null)
    }
  }

  const removeListing = async (id: string) => {
    setSavingId(id)
    try {
      await api.delete(`/pharmacy/listings/${id}/`)
      setListings((prev) => prev.filter((l) => l.id !== id))
      toast.success('Stopped carrying this medicine.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove listing.')
    } finally {
      setSavingId(null)
    }
  }

  const startAdd = (medicineId: string) => {
    setAddingId(medicineId)
    setAddForm({ stock_quantity: '10', expiry_date: todayPlusYear() })
  }

  const confirmAdd = async (medicineId: string) => {
    if (!addForm) return
    const qty = Number(addForm.stock_quantity)
    if (isNaN(qty) || qty < 0) { toast.error('Invalid stock quantity.'); return }
    if (!addForm.expiry_date) { toast.error('Expiry date is required.'); return }
    setSavingId(medicineId)
    try {
      await api.post('/pharmacy/listings/', { medicine_id: medicineId, stock_quantity: qty, expiry_date: addForm.expiry_date, is_available: true })
      toast.success('Added to your listings!')
      setAddingId(null)
      setAddForm(null)
      loadListings()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add listing.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Inventory</h1>
        <p className="text-sm text-on-surface-variant mt-1">Manage what you carry, your stock, and expiry dates.</p>
      </div>

      <div className="flex gap-1 border-b border-outline-variant">
        <button onClick={() => setTab('listings')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'listings' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
          My Listings ({listings.length})
        </button>
        <button onClick={() => setTab('catalog')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'catalog' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
          Add Medicines
        </button>
      </div>

      {tab === 'listings' && (
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  {['Medicine', 'Price', 'Stock', 'Expiry', 'Available', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loadingListings ? (
                  [...Array(4)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
                ) : listings.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">You're not carrying any medicines yet — add some from the "Add Medicines" tab.</td></tr>
                ) : listings.map((l) => {
                  const e = edits[l.id] || { stock_quantity: '0', expiry_date: '', is_available: true }
                  return (
                    <tr key={l.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{l.medicine_name}</td>
                      <td className="px-4 py-3 text-on-surface-variant">NPR {Number(l.medicine_price).toFixed(0)}</td>
                      <td className="px-4 py-3">
                        <input type="number" min={0} value={e.stock_quantity}
                          onChange={(ev) => setEdits((p) => ({ ...p, [l.id]: { ...e, stock_quantity: ev.target.value } }))}
                          className="w-20 px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="date" value={e.expiry_date}
                          onChange={(ev) => setEdits((p) => ({ ...p, [l.id]: { ...e, expiry_date: ev.target.value } }))}
                          className="px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setEdits((p) => ({ ...p, [l.id]: { ...e, is_available: !e.is_available } }))}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${e.is_available ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                          {e.is_available ? 'Available' : 'Paused'}
                        </button>
                      </td>
                      <td className="px-4 py-3 flex items-center gap-2">
                        <button onClick={() => saveListing(l.id)} disabled={savingId === l.id}
                          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                          Save
                        </button>
                        <button onClick={() => removeListing(l.id)} disabled={savingId === l.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-error hover:bg-error-container transition-colors disabled:opacity-60">
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="space-y-3">
          <input type="text" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Search medicines by name or brand..."
            className="w-full max-w-md px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />

          <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
            <div className="divide-y divide-outline-variant">
              {loadingCatalog ? (
                [...Array(4)].map((_, i) => <div key={i} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></div>)
              ) : catalog.length === 0 ? (
                <div className="px-4 py-12 text-center text-on-surface-variant">No medicines found.</div>
              ) : catalog.map((m) => {
                const already = listedMedicineIds.has(m.id)
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                        <p className="text-xs text-on-surface-variant">{m.brand_name} · NPR {Number(m.price).toFixed(0)}</p>
                      </div>
                      {already ? (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 whitespace-nowrap">Already carrying</span>
                      ) : addingId === m.id ? null : (
                        <button onClick={() => startAdd(m.id)}
                          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">
                          Add to Listings
                        </button>
                      )}
                    </div>
                    {addingId === m.id && addForm && (
                      <div className="mt-3 flex flex-wrap items-end gap-3 bg-surface-container-low rounded-xl p-3">
                        <div>
                          <label className="text-[10px] font-medium text-on-surface-variant">Stock Quantity</label>
                          <input type="number" min={0} value={addForm.stock_quantity}
                            onChange={(e) => setAddForm((p) => p && { ...p, stock_quantity: e.target.value })}
                            className="mt-0.5 w-24 px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-on-surface-variant">Expiry Date</label>
                          <input type="date" value={addForm.expiry_date}
                            onChange={(e) => setAddForm((p) => p && { ...p, expiry_date: e.target.value })}
                            className="mt-0.5 px-2 py-1.5 border border-outline-variant rounded-lg bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary" />
                        </div>
                        <button onClick={() => confirmAdd(m.id)} disabled={savingId === m.id}
                          className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                          Confirm
                        </button>
                        <button onClick={() => { setAddingId(null); setAddForm(null) }}
                          className="px-3 py-1.5 border border-outline-variant text-on-surface-variant text-xs font-semibold rounded-lg hover:bg-surface-container transition-colors">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
