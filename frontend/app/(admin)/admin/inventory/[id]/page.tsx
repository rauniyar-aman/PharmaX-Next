'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [medicine, setMedicine] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [newStock, setNewStock] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [action, setAction] = useState<'SET' | 'ADD' | 'SUBTRACT'>('SET')

  useEffect(() => {
    api.get(`/admin/medicines/${id}/`)
      .then((r) => {
        setMedicine(r.data.data.medicine)
        setNewStock(String(r.data.data.medicine.stock_quantity))
      })
      .catch(() => toast.error('Medicine not found.'))
      .finally(() => setLoading(false))
  }, [id])

  const computedQty = () => {
    const val = parseInt(newStock) || 0
    if (action === 'SET') return val
    if (action === 'ADD') return (medicine?.stock_quantity || 0) + val
    return Math.max(0, (medicine?.stock_quantity || 0) - val)
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const qty = computedQty()
      const res = await api.put(`/admin/inventory/${id}/`, { stock_quantity: qty, note })
      setMedicine(res.data.data.medicine)
      setNote('')
      if (action !== 'SET') setNewStock('')
      else setNewStock(String(qty))
      toast.success('Stock updated!')
    } catch {
      toast.error('Failed to update stock.')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!medicine) return <div className="text-center py-16"><p className="text-on-surface-variant">Medicine not found.</p></div>

  const pct = Math.min(100, Math.round((medicine.stock_quantity / Math.max(medicine.stock_quantity, 100)) * 100))
  const stockColor = medicine.stock_quantity === 0 ? 'bg-error' : medicine.stock_quantity <= 10 ? 'bg-amber-400' : 'bg-primary'

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/inventory" className="hover:text-primary transition-colors">Inventory</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{medicine.name}</span>
      </div>

      {/* Medicine card */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex gap-5">
        {medicine.image_url ? (
          <img src={medicine.image_url} alt={medicine.name} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '40px' }}>medication</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${medicine.type === 'Rx' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>{medicine.type}</span>
              <h1 className="text-xl font-bold text-on-surface mt-1">{medicine.name}</h1>
              <p className="text-sm text-on-surface-variant">{medicine.brand} · {medicine.category?.name}</p>
            </div>
            <Link href={`/admin/inventory/${id}/log`}
              className="flex items-center gap-1.5 px-4 py-2 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>history</span>
              Stock Log
            </Link>
          </div>
          <div className="flex gap-4 mt-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-on-surface">{medicine.stock_quantity}</p>
              <p className="text-xs text-on-surface-variant">Current Stock</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-on-surface">NPR {Number(medicine.price).toFixed(0)}</p>
              <p className="text-xs text-on-surface-variant">Unit Price</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${medicine.in_stock ? 'text-primary' : 'text-error'}`}>{medicine.in_stock ? 'In Stock' : 'Out'}</p>
              <p className="text-xs text-on-surface-variant">Availability</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stock level bar */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-sm font-bold text-on-surface">Stock Level</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-on-surface-variant">Current</span>
            <span className={`font-semibold ${medicine.stock_quantity === 0 ? 'text-error' : medicine.stock_quantity <= 10 ? 'text-amber-600' : 'text-primary'}`}>
              {medicine.stock_quantity} units
            </span>
          </div>
          <div className="h-3 bg-surface-container-low rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${stockColor}`} style={{ width: `${pct}%` }} />
          </div>
          {medicine.stock_quantity === 0 && (
            <p className="text-xs text-error font-medium flex items-center gap-1">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>warning</span>
              Out of stock — this medicine is hidden from customers
            </p>
          )}
          {medicine.stock_quantity > 0 && medicine.stock_quantity <= 10 && (
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>warning</span>
              Low stock — consider restocking soon
            </p>
          )}
        </div>
      </div>

      {/* Update stock */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <p className="text-sm font-bold text-on-surface">Update Stock</p>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="flex gap-2">
            {[
              { val: 'SET', label: 'Set to', icon: 'tune' },
              { val: 'ADD', label: 'Add', icon: 'add' },
              { val: 'SUBTRACT', label: 'Remove', icon: 'remove' },
            ].map((opt) => (
              <button key={opt.val} type="button" onClick={() => { setAction(opt.val as any); setNewStock('') }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors border ${action === opt.val ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/40 hover:text-on-surface'}`}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-on-surface-variant">
              {action === 'SET' ? 'New stock quantity' : action === 'ADD' ? 'Units to add' : 'Units to remove'}
            </label>
            <input type="number" min="0" required value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>

          {newStock && !isNaN(parseInt(newStock)) && (
            <div className="bg-surface-container-low rounded-xl p-3 text-sm flex items-center justify-between">
              <span className="text-on-surface-variant">Result:</span>
              <span className="font-bold text-on-surface">{medicine.stock_quantity} → {computedQty()} units</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-on-surface-variant">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Restocked from supplier, manual correction..."
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>

          <button type="submit" disabled={saving || !newStock}
            className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Updating...</> : 'Update Stock'}
          </button>
        </form>
      </div>
    </div>
  )
}
