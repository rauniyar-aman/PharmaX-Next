'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

interface DashStats {
  total_customers: number
  total_orders: number
  total_revenue: number
  pending_orders: number
  low_stock_count: number
  pending_prescriptions: number
  recent_orders: any[]
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/dashboard/').then((r) => setStats(r.data.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Total Customers', value: stats?.total_customers ?? 0, icon: 'group', color: 'bg-secondary/10 text-secondary', href: '/admin/customers' },
    { label: 'Total Orders', value: stats?.total_orders ?? 0, icon: 'package_2', color: 'bg-primary/10 text-primary', href: '/admin/orders' },
    { label: 'Revenue (NPR)', value: `${((stats?.total_revenue ?? 0) / 1000).toFixed(1)}K`, icon: 'payments', color: 'bg-emerald-50 text-emerald-600', href: '/admin/reports' },
    { label: 'Active Orders', value: stats?.pending_orders ?? 0, icon: 'pending_actions', color: 'bg-amber-50 text-amber-600', href: '/admin/orders' },
    { label: 'Low Stock Items', value: stats?.low_stock_count ?? 0, icon: 'inventory_2', color: 'bg-error/10 text-error', href: '/admin/inventory' },
    { label: 'Pending Rx', value: stats?.pending_prescriptions ?? 0, icon: 'description', color: 'bg-purple-50 text-purple-600', href: '/admin/prescriptions' },
  ]

  // Order.status alone sits at PLACED for the entire journey from payment through delivery — it
  // doesn't distinguish "pharmacy packing it" from "with the rider". These two maps cover both
  // levels: the order-level pill (now including the marketplace-matching statuses this used to be
  // missing entirely) and the per-pharmacy fulfillment-leg badges shown beneath each row.
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
    DELIVERED: 'bg-emerald-50 text-emerald-600',
    CANCELLED: 'bg-error/10 text-error',
  }

  const FULFILLMENT_STATUS_CFG: Record<string, { label: string; color: string }> = {
    BROADCASTING:      { label: 'Awaiting Pharmacy', color: 'text-on-surface-variant' },
    ACCEPTED:          { label: 'Preparing',          color: 'text-amber-600' },
    PREPARED:          { label: 'Prepared',           color: 'text-amber-600' },
    PACKED:            { label: 'Packed',             color: 'text-blue-600' },
    NO_PHARMACY_FOUND: { label: 'No Pharmacy Found',  color: 'text-error' },
    AWAITING_DELIVERY: { label: 'Ready for Pickup',   color: 'text-blue-600' },
    OUT_FOR_DELIVERY:  { label: 'With Rider',         color: 'text-indigo-600' },
    DELIVERED:         { label: 'Delivered',          color: 'text-emerald-600' },
    CANCELLED:         { label: 'Cancelled',          color: 'text-error' },
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-5 h-28 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Link key={c.label} href={c.href}
              className="bg-surface rounded-2xl border border-outline-variant p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color} mb-3`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>{c.icon}</span>
              </div>
              <p className="text-2xl font-bold text-on-surface">{c.value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{c.label}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface rounded-2xl border border-outline-variant">
          <div className="flex items-center justify-between p-5 border-b border-outline-variant">
            <h2 className="text-sm font-bold text-on-surface">Recent Orders</h2>
            <Link href="/admin/orders" className="text-xs text-primary font-medium hover:underline">View all</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-surface-container-low rounded-xl animate-pulse" />)}</div>
          ) : !stats?.recent_orders?.length ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">No orders yet</div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {stats.recent_orders.slice(0, 6).map((order) => {
                const fulfillments = order.fulfillments || []
                return (
                  <Link key={order.id} href={`/admin/orders`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-low transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-on-surface-variant">#{order.id?.slice(0, 8).toUpperCase()}</p>
                      <p className="text-sm font-semibold text-on-surface truncate">{order.user?.full_name || 'Customer'}</p>
                      {fulfillments.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {fulfillments.map((f: any) => {
                            const cfg = f.status === 'ACCEPTED' && !f.prescription_ready
                              ? { label: 'Awaiting Prescription', color: 'text-amber-600' }
                              : FULFILLMENT_STATUS_CFG[f.status] || { label: f.status, color: 'text-on-surface-variant' }
                            return (
                              <p key={f.id} className="text-[11px] text-on-surface-variant truncate">
                                <span className="font-medium text-on-surface">{f.pharmacy_name || 'Pharmacy'}</span>
                                {' · '}<span className={cfg.color}>{cfg.label}</span>
                              </p>
                            )
                          })}
                        </div>
                      ) : order.status === 'BROADCASTING' && (
                        <p className="text-[11px] text-on-surface-variant mt-1">Finding a pharmacy…</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                      <p className="text-sm font-bold text-on-surface mt-0.5">NPR {Number(order.total_amount).toFixed(0)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-surface rounded-2xl border border-outline-variant">
          <div className="flex items-center justify-between p-5 border-b border-outline-variant">
            <h2 className="text-sm font-bold text-on-surface">Quick Actions</h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            {[
              { href: '/admin/medicines/add', icon: 'add_circle', label: 'Add Medicine', color: 'bg-primary/10 text-primary border-primary/20' },
              { href: '/admin/categories/add', icon: 'category', label: 'Add Category', color: 'bg-secondary/10 text-secondary border-secondary/20' },
              { href: '/admin/orders', icon: 'package_2', label: 'Manage Orders', color: 'bg-amber-50 text-amber-600 border-amber-200' },
              { href: '/admin/prescriptions', icon: 'description', label: 'Review Rx', color: 'bg-purple-50 text-purple-600 border-purple-200' },
              { href: '/admin/inventory', icon: 'inventory_2', label: 'Inventory', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
              { href: '/admin/customers', icon: 'group', label: 'Customers', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
            ].map((a) => (
              <Link key={a.href} href={a.href}
                className={`flex items-center gap-2.5 p-3 rounded-xl border ${a.color} hover:shadow-sm transition-all`}>
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{a.icon}</span>
                <span className="text-xs font-semibold">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
