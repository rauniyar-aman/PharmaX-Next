'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'

const TABS = ['Orders', 'Addresses', 'Prescriptions', 'Reviews', 'Wishlist'] as const
type Tab = typeof TABS[number]

const ORDER_STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-blue-50 text-blue-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  PROCESSING: 'bg-amber-50 text-amber-600',
  SHIPPED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
  RETURNED: 'bg-error/10 text-error',
}

const PRESCRIPTION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  VERIFIED: 'bg-emerald-50 text-emerald-600',
  REJECTED: 'bg-error/10 text-error',
  EXPIRED: 'bg-surface-container text-on-surface-variant',
}

function StatChip({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2.5 bg-surface-container-low rounded-xl px-3.5 py-2.5">
      <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '18px' }}>{icon}</span>
      <div>
        <p className="text-sm font-bold text-on-surface leading-tight">{value}</p>
        <p className="text-[10px] text-on-surface-variant leading-tight">{label}</p>
      </div>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [wishlist, setWishlist] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [blocking, setBlocking] = useState(false)
  const [tab, setTab] = useState<Tab>('Orders')

  useEffect(() => {
    api.get(`/admin/customers/${id}/`).then((res) => {
      const d = res.data.data
      setCustomer(d.customer)
      setOrders(d.orders || [])
      setAddresses(d.addresses || [])
      setPrescriptions(d.prescriptions || [])
      setReviews(d.reviews || [])
      setWishlist(d.wishlist || [])
      setStats(d.stats || null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  const handleToggleBlock = async () => {
    setBlocking(true)
    try {
      const res = await api.put(`/admin/customers/${id}/block/`)
      setCustomer((prev: any) => ({ ...prev, is_active: res.data.data.customer.is_active }))
      toast.success(res.data.message || 'Updated.')
    } catch {
      toast.error('Failed to update customer status.')
    } finally {
      setBlocking(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
  if (!customer) return <div className="text-center py-24"><p className="text-base text-on-surface">Customer not found.</p><Link href="/admin/customers" className="text-sm text-primary hover:underline mt-2 block">Back</Link></div>

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/customers" className="hover:text-primary transition-colors">Customers</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">{customer.full_name}</span>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-primary">{customer.full_name?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <p className="text-lg font-bold text-on-surface">{customer.full_name}</p>
              <p className="text-sm text-on-surface-variant">{customer.email}</p>
              {customer.phone && <p className="text-sm text-on-surface-variant">{customer.phone}</p>}
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${customer.is_email_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {customer.is_email_verified ? 'Email Verified' : 'Unverified'}
                </span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${customer.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
                  {customer.is_active ? 'Active' : 'Blocked'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1.5">Joined {new Date(customer.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <button onClick={handleToggleBlock} disabled={blocking}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${customer.is_active ? 'text-error border border-error/30 hover:bg-error/10' : 'text-primary border border-primary/30 hover:bg-primary/10'}`}>
            {blocking ? '...' : customer.is_active ? 'Block Customer' : 'Unblock Customer'}
          </button>
        </div>

        {(customer.dob || customer.gender || customer.blood_group || customer.allergies) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-outline-variant">
            {customer.dob && <div><p className="text-[10px] text-on-surface-variant">Date of Birth</p><p className="text-sm font-medium text-on-surface">{customer.dob}</p></div>}
            {customer.gender && <div><p className="text-[10px] text-on-surface-variant">Gender</p><p className="text-sm font-medium text-on-surface">{customer.gender}</p></div>}
            {customer.blood_group && <div><p className="text-[10px] text-on-surface-variant">Blood Group</p><p className="text-sm font-medium text-on-surface">{customer.blood_group}</p></div>}
            {customer.allergies && <div><p className="text-[10px] text-on-surface-variant">Allergies</p><p className="text-sm font-medium text-on-surface">{customer.allergies}</p></div>}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-4 border-t border-outline-variant">
            <StatChip icon="package_2" label="Orders" value={stats.total_orders} />
            <StatChip icon="payments" label="Total Spent" value={`NPR ${Number(stats.total_spent).toFixed(0)}`} />
            <StatChip icon="location_on" label="Addresses" value={stats.total_addresses} />
            <StatChip icon="description" label="Prescriptions" value={stats.total_prescriptions} />
            <StatChip icon="rate_review" label="Reviews" value={stats.total_reviews} />
            <StatChip icon="favorite" label="Wishlist" value={stats.total_wishlist} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-outline-variant overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {t} <span className="text-xs font-normal opacity-70">
              ({{ Orders: orders.length, Addresses: addresses.length, Prescriptions: prescriptions.length, Reviews: reviews.length, Wishlist: wishlist.length }[t]})
            </span>
          </button>
        ))}
      </div>

      {tab === 'Orders' && (
        orders.length === 0 ? <EmptyState icon="package_2" text="No orders yet" /> : (
          <div className="space-y-3">
            {orders.map((order: any) => (
              <div key={order.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-mono text-on-surface-variant">#{order.id?.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-on-surface-variant">{new Date(order.placed_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium capitalize ${order.payment_status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.payment_status}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_COLORS[order.status] || 'bg-surface-container text-on-surface-variant'}`}>
                      {order.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-outline-variant border-y border-outline-variant">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-on-surface">{item.medicine?.name} <span className="text-on-surface-variant">× {item.quantity}</span></span>
                      <span className="font-medium text-on-surface">NPR {(Number(item.unit_price) * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  {order.shipping_address && (
                    <p className="text-xs text-on-surface-variant">
                      Ship to: {order.shipping_address.full_name}, {order.shipping_address.address_line1}, {order.shipping_address.city}
                    </p>
                  )}
                  <p className="text-sm font-bold text-on-surface ml-auto">Total: NPR {Number(order.total_amount).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Addresses' && (
        addresses.length === 0 ? <EmptyState icon="location_on" text="No saved addresses" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {addresses.map((addr: any) => (
              <div key={addr.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary uppercase">{addr.label}</span>
                  {addr.is_default && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Default</span>}
                </div>
                <p className="text-sm font-medium text-on-surface">{addr.full_name} · {addr.phone}</p>
                <p className="text-xs text-on-surface-variant">{addr.address_line1}, {addr.city}, {addr.state} {addr.zip_code}</p>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Prescriptions' && (
        prescriptions.length === 0 ? <EmptyState icon="description" text="No prescriptions uploaded" /> : (
          <div className="space-y-3">
            {prescriptions.map((rx: any) => (
              <div key={rx.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-on-surface">{rx.file_name || 'Prescription'}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRESCRIPTION_STATUS_COLORS[rx.status] || 'bg-surface-container text-on-surface-variant'}`}>{rx.status}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {[rx.doctor, rx.hospital].filter(Boolean).join(' · ') || 'No doctor/hospital info'}
                  </p>
                  <p className="text-xs text-on-surface-variant">Uploaded {new Date(rx.uploaded_at).toLocaleDateString()}</p>
                  {rx.rejection_reason && <p className="text-xs text-error mt-1">Rejected: {rx.rejection_reason}</p>}
                </div>
                {rx.file_url && (
                  <a href={rx.file_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 flex-shrink-0">
                    View File
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Reviews' && (
        reviews.length === 0 ? <EmptyState icon="rate_review" text="No reviews written" /> : (
          <div className="space-y-3">
            {reviews.map((rev: any) => (
              <div key={rev.id} className="bg-surface rounded-2xl border border-outline-variant p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-on-surface">{rev.medicine?.name}</p>
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={`material-symbols-outlined ${i < rev.rating ? 'ms-filled text-amber-400' : 'text-outline-variant'}`} style={{ fontSize: '14px' }}>star</span>
                    ))}
                  </div>
                </div>
                {rev.comment && <p className="text-sm text-on-surface-variant mt-1.5">{rev.comment}</p>}
                <p className="text-xs text-on-surface-variant mt-1.5">{new Date(rev.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Wishlist' && (
        wishlist.length === 0 ? <EmptyState icon="favorite" text="Wishlist is empty" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {wishlist.map((med: any) => (
              <div key={med.id} className="bg-surface rounded-2xl border border-outline-variant p-4">
                <p className="text-xs font-semibold text-on-surface-variant uppercase">{med.category_name}</p>
                <p className="text-sm font-medium text-on-surface mt-0.5">{med.name}</p>
                <p className="text-sm font-bold text-on-surface mt-1">NPR {Number(med.price).toFixed(0)}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant text-center py-12">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '40px' }}>{icon}</span>
      <p className="text-sm text-on-surface-variant mt-2">{text}</p>
    </div>
  )
}
