'use client'
import { Fragment, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'

const STATUSES = ['ALL', 'AWAITING_PRESCRIPTION', 'PRESCRIPTION_REJECTED', 'BROADCASTING', 'AWAITING_PAYMENT', 'NO_PHARMACY_FOUND', 'PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  AWAITING_PRESCRIPTION: 'bg-amber-50 text-amber-600',
  PRESCRIPTION_REJECTED: 'bg-error/10 text-error',
  BROADCASTING: 'bg-surface-container text-on-surface-variant',
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-600',
  NO_PHARMACY_FOUND: 'bg-error/10 text-error',
  PLACED: 'bg-blue-50 text-blue-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  PROCESSING: 'bg-amber-50 text-amber-600',
  SHIPPED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

// FulfillmentRequest.status — every pharmacy an order's items were offered to, and how they
// responded. This is what answers "which pharmacies saw this and declined or ignored it," even
// for a NO_PHARMACY_FOUND order that never produced a single accepted fulfillment.
const REQUEST_STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING:  { label: 'Awaiting Response', color: 'bg-blue-50 text-blue-600',       icon: 'hourglass_top' },
  ACCEPTED: { label: 'Accepted',          color: 'bg-emerald-50 text-emerald-600', icon: 'check_circle' },
  DECLINED: { label: 'Declined',          color: 'bg-error/10 text-error',         icon: 'thumb_down' },
  EXPIRED:  { label: 'Ignored (Expired)', color: 'bg-surface-container text-on-surface-variant', icon: 'schedule' },
}

// Fulfillment-leg status is the granular "packed / ready for pickup / with rider / delivered"
// progress — Order.status (above) doesn't capture this, it just sits at PLACED the whole time.
const FULFILLMENT_STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  BROADCASTING:       { label: 'Awaiting Pharmacy',  color: 'bg-surface-container text-on-surface-variant', icon: 'wifi_tethering' },
  ACCEPTED:           { label: 'Preparing',           color: 'bg-amber-50 text-amber-600',     icon: 'inventory' },
  PREPARED:           { label: 'Prepared',            color: 'bg-amber-50 text-amber-600',     icon: 'task_alt' },
  PACKED:             { label: 'Packed',              color: 'bg-blue-50 text-blue-600',       icon: 'inventory_2' },
  NO_PHARMACY_FOUND:  { label: 'No Pharmacy Found',   color: 'bg-error/10 text-error',          icon: 'help' },
  AWAITING_DELIVERY:  { label: 'Ready for Pickup',    color: 'bg-blue-50 text-blue-600',        icon: 'hourglass_top' },
  OUT_FOR_DELIVERY:   { label: 'With Rider',          color: 'bg-indigo-50 text-indigo-600',    icon: 'sports_motorsports' },
  DELIVERED:          { label: 'Delivered',           color: 'bg-emerald-50 text-emerald-600',  icon: 'check_circle' },
  CANCELLED:          { label: 'Cancelled',           color: 'bg-error/10 text-error',          icon: 'cancel' },
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updating, setUpdating] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const params: any = { page, limit: 15 }
    if (statusFilter !== 'ALL') params.status = statusFilter
    if (search) params.search = search
    api.get('/admin/orders/', { params })
      .then((r) => {
        setOrders(r.data.data.orders || [])
        setTotalPages(r.data.data.pagination?.totalPages || 1)
      }).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter, search, page])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const updateStatus = async (orderId: string, status: string) => {
    setUpdating(orderId)
    try {
      await api.put(`/admin/orders/${orderId}/`, { status })
      toast.success('Order updated.')
      fetchOrders()
    } catch {
      toast.error('Failed to update order.')
    } finally {
      setUpdating(null)
    }
  }

  const deleteOrder = async (orderId: string) => {
    if (!confirm('Permanently delete this cancelled order? This cannot be undone.')) return
    setUpdating(orderId)
    try {
      await api.delete(`/admin/orders/${orderId}/`)
      toast.success('Order deleted.')
      fetchOrders()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete order.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input type="text" placeholder="Search by order ID or customer..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Order ID', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(8)].map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-on-surface-variant">No orders found</td></tr>
              ) : orders.map((order) => {
                const expanded = expandedId === order.id
                return (
                <Fragment key={order.id}>
                  <tr onClick={() => setExpandedId(expanded ? null : order.id)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${expanded ? 'rotate-90' : ''}`} style={{ fontSize: '16px' }}>chevron_right</span>
                        #{order.id?.slice(0, 8).toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-on-surface">{order.user?.full_name}</p>
                      <p className="text-xs text-on-surface-variant">{order.user?.email}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface">{order.items?.length}</td>
                    <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(order.total_amount).toFixed(0)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium capitalize ${order.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{new Date(order.placed_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <select value={order.status} onChange={(e) => updateStatus(order.id, e.target.value)} disabled={updating === order.id}
                          className="text-xs border border-outline-variant rounded-lg px-2 py-1.5 bg-surface text-on-surface focus:outline-none focus:border-secondary transition disabled:opacity-60">
                          {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                        <Link href={`/admin/orders/${order.id}`} title="View full details & live tracking"
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors flex-shrink-0">
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
                        </Link>
                        {order.status === 'CANCELLED' && (
                          <button onClick={() => deleteOrder(order.id)} disabled={updating === order.id} title="Permanently delete this cancelled order"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:text-error hover:border-error transition-colors flex-shrink-0 disabled:opacity-60">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${order.id}-detail`} className="bg-surface-container-low">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="space-y-2">
                          {(order.fulfillments || []).length > 0 && (
                            <div className="space-y-1.5 pb-1">
                              <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Fulfillment Progress</p>
                              {order.fulfillments.map((f: any) => {
                                const cfg = FULFILLMENT_STATUS_CFG[f.status] || { label: f.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
                                return (
                                  <div key={f.id} className="flex items-center justify-between gap-3 bg-surface rounded-xl border border-outline-variant px-3 py-2 flex-wrap">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-on-surface truncate">{f.pharmacy_name || 'Unassigned'}</p>
                                      <p className="text-xs text-on-surface-variant truncate">
                                        {(f.items || []).map((i: any) => `${i.medicine_name} × ${i.quantity}`).join(', ')}
                                        {f.delivery_agent_name ? ` · Rider: ${f.delivery_agent_name}` : ''}
                                      </p>
                                    </div>
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                                      {cfg.label}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {(order.fulfillment_requests || []).length > 0 && (
                            <div className="space-y-1.5 pb-1">
                              <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Pharmacies Asked</p>
                              {order.fulfillment_requests.map((r: any) => {
                                const cfg = REQUEST_STATUS_CFG[r.status] || { label: r.status, color: 'bg-surface-container text-on-surface-variant', icon: 'help' }
                                return (
                                  <div key={r.id} className="flex items-center justify-between gap-3 bg-surface rounded-xl border border-outline-variant px-3 py-2 flex-wrap">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-on-surface truncate">{r.pharmacy_name}</p>
                                      <p className="text-xs text-on-surface-variant truncate">
                                        {r.medicine_name} × {r.quantity}
                                        {r.responded_at ? ` · Responded ${new Date(r.responded_at).toLocaleString()}` : ` · Asked ${new Date(r.created_at).toLocaleString()}`}
                                      </p>
                                    </div>
                                    <span className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>
                                      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{cfg.icon}</span>
                                      {cfg.label}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {(order.items || []).map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3 bg-surface rounded-xl border border-outline-variant p-2.5">
                              {item.medicine?.image_url ? (
                                <img src={resolveImg(item.medicine.image_url) || undefined} alt={item.medicine.name}
                                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center flex-shrink-0">
                                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>medication</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-on-surface truncate">{item.medicine?.name || 'Medicine removed'}</p>
                                <p className="text-xs text-on-surface-variant">{item.medicine?.brand_name}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs text-on-surface-variant">{item.quantity} × NPR {Number(item.unit_price).toFixed(0)}</p>
                                <p className="text-sm font-semibold text-on-surface">NPR {(item.quantity * Number(item.unit_price)).toFixed(0)}</p>
                              </div>
                            </div>
                          ))}
                          {order.shipping_address && (
                            <p className="text-xs text-on-surface-variant pt-1">
                              Deliver to: {order.shipping_address.address_line1}, {order.shipping_address.city}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
          </button>
          {[...Array(Math.min(totalPages, 7))].map((_, i) => (
            <button key={i + 1} onClick={() => setPage(i + 1)}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${page === i + 1 ? 'bg-secondary-container text-on-secondary-container' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {i + 1}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
          </button>
        </div>
      )}
    </div>
  )
}
