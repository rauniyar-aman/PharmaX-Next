'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'

const STATUS_CFG: Record<string, { label: string; color: string; dot: string }> = {
  PLACED:           { label: 'Placed',            color: 'bg-surface-container text-on-surface-variant', dot: 'bg-on-surface-variant' },
  CONFIRMED:        { label: 'Confirmed',          color: 'bg-blue-100 text-blue-700',                   dot: 'bg-blue-500' },
  PROCESSING:       { label: 'Processing',         color: 'bg-amber-100 text-amber-700',                 dot: 'bg-amber-500' },
  SHIPPED:          { label: 'Shipped',            color: 'bg-indigo-100 text-indigo-700',               dot: 'bg-indigo-500' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery',   color: 'bg-orange-100 text-orange-700',               dot: 'bg-orange-500' },
  DELIVERED:        { label: 'Delivered',          color: 'bg-primary/10 text-primary',                  dot: 'bg-primary' },
  CANCELLED:        { label: 'Cancelled',          color: 'bg-error/10 text-error',                      dot: 'bg-error' },
}

const TIMELINE = ['Order Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered']
const STATUS_STEP: Record<string, number> = {
  PLACED: 0, CONFIRMED: 1, PROCESSING: 2, SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5,
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TrackingPanel({ order, onClose, onStatusUpdate }: {
  order: any
  onClose: () => void
  onStatusUpdate: (updated: any) => void
}) {
  const [newStatus, setNewStatus] = useState(order.status)
  const [saving, setSaving] = useState(false)
  const currentStep = STATUS_STEP[order.status] ?? -1

  const saveStatus = async () => {
    if (newStatus === order.status) return
    setSaving(true)
    try {
      const res = await api.put(`/admin/orders/${order.id}/`, { status: newStatus })
      onStatusUpdate({ ...order, status: newStatus })
      toast.success('Status updated.')
    } catch {
      toast.error('Failed to update status.')
    } finally { setSaving(false) }
  }

  const cfg = STATUS_CFG[order.status] || STATUS_CFG.PLACED

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-surface z-[60] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-on-surface">Delivery Tracking</h3>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">#{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Customer info */}
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">{order.user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-on-surface">{order.user?.full_name}</p>
                <p className="text-xs text-on-surface-variant">{order.user?.email}</p>
              </div>
            </div>
            {order.shipping_address && (
              <div className="flex items-start gap-2.5 pt-2 border-t border-outline-variant">
                <span className="material-symbols-outlined ms-filled text-secondary mt-0.5" style={{ fontSize: '18px' }}>location_on</span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {order.shipping_address.address_line1}
                  {order.shipping_address.address_line2 ? `, ${order.shipping_address.address_line2}` : ''},&nbsp;
                  {order.shipping_address.city}, {order.shipping_address.state}
                </p>
              </div>
            )}
          </div>

          {/* Current status badge */}
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase font-bold tracking-wider mb-2">Current Status</p>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${cfg.color}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>

          {/* Timeline */}
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase font-bold tracking-wider mb-4">Order Timeline</p>
            <div className="space-y-0">
              {TIMELINE.map((label, i) => {
                const done = i <= currentStep
                const active = i === currentStep
                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${done ? 'bg-primary text-on-primary' : 'bg-surface-container border-2 border-outline-variant text-on-surface-variant'}`}>
                        {done
                          ? <span className="material-symbols-outlined ms-filled" style={{ fontSize: '16px' }}>check</span>
                          : <span className="text-xs font-bold">{i + 1}</span>
                        }
                      </div>
                      {i < TIMELINE.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[24px] mt-1 mb-1 ${i < currentStep ? 'bg-primary' : 'bg-outline-variant'}`} />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-semibold ${active ? 'text-primary' : done ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                        {label}
                      </p>
                      {active && <p className="text-xs text-primary/80 mt-0.5">Current status</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase font-bold tracking-wider mb-3">Package Contents</p>
            <div className="space-y-2">
              {order.items?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl p-3">
                  {item.medicine?.image_url ? (
                    <img src={resolveImg(item.medicine.image_url) || undefined} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>medication</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-on-surface truncate">{item.medicine?.name}</p>
                    <p className="text-[11px] text-on-surface-variant">Qty: {item.quantity} · NPR {Number(item.unit_price).toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Update status */}
          {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
              <p className="text-[11px] text-on-surface-variant uppercase font-bold tracking-wider mb-3">Update Delivery Status</p>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                className="w-full border border-outline-variant rounded-xl text-sm py-2.5 px-3 focus:ring-2 focus:ring-primary focus:outline-none bg-surface mb-3">
                {Object.entries(STATUS_CFG).map(([s, c]) => (
                  <option key={s} value={s}>{c.label}</option>
                ))}
              </select>
              <button onClick={saveStatus} disabled={saving || newStatus === order.status}
                className="w-full py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? 'Updating…' : 'Update Status'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function AdminDeliveryPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, limit: 15 }
      if (search) params.search = search
      if (filterStatus) params.status = filterStatus
      const res = await api.get('/admin/orders/', { params })
      const d = res.data.data
      setOrders(d.orders || [])
      setPages(d.pagination?.totalPages || 1)
      setTotal(d.pagination?.total || 0)
    } catch {}
    finally { setLoading(false) }
  }, [page, search, filterStatus])

  useEffect(() => { load() }, [load])

  const handleStatusUpdate = (updated: any) => {
    setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
    setSelected(updated)
  }

  const counts = {
    pending:   orders.filter((o) => ['PLACED', 'CONFIRMED', 'PROCESSING'].includes(o.status)).length,
    inTransit: orders.filter((o) => ['SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-on-surface-variant">Track and manage all order deliveries.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Deliveries',  value: total,          icon: 'local_shipping',       color: 'bg-primary/10 text-primary' },
          { label: 'Pending',           value: counts.pending, icon: 'pending',              color: 'bg-amber-50 text-amber-600' },
          { label: 'In Transit',        value: counts.inTransit, icon: 'delivery_truck_speed', color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Delivered',         value: counts.delivered, icon: 'check_circle',        color: 'bg-emerald-50 text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="bg-surface rounded-2xl border border-outline-variant p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{s.icon}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{s.value}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search order ID or customer…"
            className="w-full pl-9 pr-4 py-2.5 border border-outline-variant rounded-xl text-sm bg-surface text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none transition"
            onKeyDown={(e) => { if (e.key === 'Enter') { setSearch((e.target as HTMLInputElement).value); setPage(1) } }}
          />
        </div>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
          className="border border-outline-variant rounded-xl text-sm py-2.5 px-3 bg-surface text-on-surface focus:ring-2 focus:ring-secondary focus:outline-none transition min-w-[160px]">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([s, c]) => (
            <option key={s} value={s}>{c.label}</option>
          ))}
        </select>
        <button
          onClick={() => { setSearch(''); setFilterStatus(''); setPage(1); if (searchRef.current) searchRef.current.value = '' }}
          className="p-2.5 rounded-xl border border-outline-variant hover:bg-surface-container transition-colors text-on-surface-variant"
          title="Clear filters"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_list_off</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface border border-outline-variant rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Delivery ID', 'Customer', 'Address', 'Items', 'Status', 'Date', 'Track'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-surface-container-low rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-on-surface-variant">
                    <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>local_shipping</span>
                    <p className="text-sm mt-2">No deliveries found</p>
                  </td>
                </tr>
              ) : orders.map((order) => {
                const cfg = STATUS_CFG[order.status] || STATUS_CFG.PLACED
                const addr = order.shipping_address
                return (
                  <tr key={order.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-on-surface-variant">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-on-surface">{order.user?.full_name}</p>
                      <p className="text-xs text-on-surface-variant">{order.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[180px] truncate">
                      {addr ? `${addr.address_line1}, ${addr.city}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface">{order.items?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(order.placed_at)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(order)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-xs font-semibold"
                      >
                        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '14px' }}>gps_fixed</span>
                        Track
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-4 border-t border-outline-variant flex justify-between items-center flex-wrap gap-3">
          <p className="text-sm text-on-surface-variant">Showing {orders.length} of {total} deliveries</p>
          {pages > 1 && (
            <div className="flex gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              {[...Array(Math.min(pages, 5))].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-primary text-on-primary' : 'border border-outline-variant hover:bg-surface-container'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <TrackingPanel order={selected} onClose={() => setSelected(null)} onStatusUpdate={handleStatusUpdate} />
      )}
    </div>
  )
}
