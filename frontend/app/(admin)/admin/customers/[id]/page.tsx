'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/admin/customers/${id}/`),
    ]).then(([custRes]) => {
      const d = custRes.data.data
      setCustomer(d.customer || d.user)
      setOrders(d.orders || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!customer) return <div className="text-center py-24"><p className="text-base text-on-surface">Customer not found.</p><Link href="/admin/customers" className="text-sm text-primary hover:underline mt-2 block">Back</Link></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/customers" className="hover:text-primary transition-colors">Customers</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{customer.full_name}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-primary">{customer.full_name?.[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-on-surface">{customer.full_name}</p>
            <p className="text-sm text-on-surface-variant">{customer.email}</p>
            {customer.phone && <p className="text-sm text-on-surface-variant">{customer.phone}</p>}
            <div className="flex gap-2 mt-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${customer.is_email_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {customer.is_email_verified ? 'Email Verified' : 'Unverified'}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant">
                {customer.role}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-1">Joined {new Date(customer.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="bg-surface rounded-2xl border border-outline-variant">
          <p className="text-sm font-bold text-on-surface p-5 border-b border-outline-variant">Order History ({orders.length})</p>
          <div className="divide-y divide-outline-variant">
            {orders.slice(0, 10).map((order: any) => (
              <div key={order.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-mono text-on-surface-variant">#{order.id?.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm font-medium text-on-surface">{order.items?.length} item{order.items?.length !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-on-surface-variant">{new Date(order.placed_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-on-surface">NPR {Number(order.total_amount).toFixed(0)}</p>
                  <span className="text-xs text-on-surface-variant capitalize">{order.status?.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
