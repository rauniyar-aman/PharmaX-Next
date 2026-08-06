'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function InventoryPage() {
  const [medicines, setMedicines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(() => {
    setLoading(true)
    const params: any = { page, limit: 20, filter }
    if (search) params.search = search
    api.get('/admin/inventory/', { params })
      .then((r) => {
        const meds = r.data.data.medicines || []
        setMedicines(meds)
        setTotal(r.data.data.pagination?.total || 0)
        setTotalPages(r.data.data.pagination?.totalPages || 1)
        const inputs: Record<string, string> = {}
        meds.forEach((m: any) => { inputs[m.id] = String(m.stock_quantity) })
        setStockInputs(inputs)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [search, filter, page])

  useEffect(() => { load() }, [load])

  const updateStock = async (id: string) => {
    const qty = Number(stockInputs[id])
    if (isNaN(qty) || qty < 0) { toast.error('Invalid quantity.'); return }
    setUpdating(id)
    try {
      await api.put(`/admin/inventory/${id}/`, { stock_quantity: qty })
      toast.success('Stock updated.')
      load()
    } catch {
      toast.error('Failed to update stock.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
            <input type="text" placeholder="Search inventory..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
          </div>
          <div className="flex gap-1.5">
            {[{ v: 'all', l: 'All' }, { v: 'low', l: 'Low Stock (≤10)' }, { v: 'out', l: 'Out of Stock' }].map((f) => (
              <button key={f.v} onClick={() => { setFilter(f.v); setPage(1) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filter === f.v ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-on-surface-variant whitespace-nowrap">{total} medicine{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Medicine', 'Category', 'Type', 'Price', 'Current Stock', 'Update Stock'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(8)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : medicines.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">No medicines found</td></tr>
              ) : medicines.map((med) => (
                <tr key={med.id} className={`hover:bg-surface-container-low transition-colors ${med.stock_quantity === 0 ? 'bg-error/5' : med.stock_quantity <= 10 ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-on-surface">{med.name}</p>
                    <p className="text-xs text-on-surface-variant">{med.brand}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{med.category_name || med.category?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${med.type === 'Rx' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>{med.type}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-on-surface">NPR {Number(med.price).toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${med.stock_quantity === 0 ? 'text-error' : med.stock_quantity <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {med.stock_quantity}
                    </span>
                    {med.stock_quantity === 0 && <span className="ml-2 text-xs text-error font-medium">Out</span>}
                    {med.stock_quantity > 0 && med.stock_quantity <= 10 && <span className="ml-2 text-xs text-amber-600 font-medium">Low</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" value={stockInputs[med.id] ?? med.stock_quantity}
                        onChange={(e) => setStockInputs((p) => ({ ...p, [med.id]: e.target.value }))}
                        className="w-20 px-2 py-1.5 border border-outline-variant rounded-lg text-sm text-on-surface bg-surface focus:outline-none focus:border-secondary transition" />
                      <button onClick={() => updateStock(med.id)} disabled={updating === med.id}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60">
                        {updating === med.id ? '...' : 'Update'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          {[...Array(Math.min(totalPages, 5))].map((_, i) => (
            <button key={i + 1} onClick={() => setPage(i + 1)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium ${page === i + 1 ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}
