'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { LabTest, LabTestCategory, LabTestBooking, LabTestBookingStatus } from '@/types'

const TABS = ['Tests', 'Categories', 'Bookings'] as const
type Tab = typeof TABS[number]

const ICONS = ['biotech', 'water_drop', 'monitor_heart', 'favorite', 'bloodtype', 'vaccines', 'health_and_safety', 'science']

const BOOKING_STATUSES: LabTestBookingStatus[] = ['PENDING', 'CONFIRMED', 'SAMPLE_COLLECTED', 'REPORT_READY', 'CANCELLED']
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-600',
  CONFIRMED: 'bg-secondary/10 text-secondary',
  SAMPLE_COLLECTED: 'bg-primary/10 text-primary',
  REPORT_READY: 'bg-emerald-50 text-emerald-600',
  CANCELLED: 'bg-error/10 text-error',
}

export default function AdminLabTestsPage() {
  const [tab, setTab] = useState<Tab>('Tests')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-outline-variant">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Tests' && <TestsTab />}
      {tab === 'Categories' && <CategoriesTab />}
      {tab === 'Bookings' && <BookingsTab />}
    </div>
  )
}

function TestsTab() {
  const [tests, setTests] = useState<LabTest[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => {
    api.get('/admin/lab-tests/').then((r) => setTests(r.data.data.labTests || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lab test?')) return
    setDeleting(id)
    try {
      await api.delete(`/admin/lab-tests/${id}/`)
      toast.success('Lab test deleted.')
      setTests((p) => p.filter((t) => t.id !== id))
    } catch {
      toast.error('Failed to delete.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{tests.length} lab tests</p>
        <Link href="/admin/lab-tests/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Lab Test
        </Link>
      </div>
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Category', 'Sample', 'Type', 'Price', 'Bookings', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : tests.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No lab tests yet</td></tr>
              ) : tests.map((t) => (
                <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">{t.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.category?.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.sample_type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.is_package ? 'bg-purple-50 text-purple-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {t.is_package ? 'Package' : 'Single Test'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(t.price).toFixed(0)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.total_bookings}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/lab-tests/${t.id}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                      </Link>
                      <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 transition-colors text-error">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CategoriesTab() {
  const [categories, setCategories] = useState<LabTestCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICONS[0])
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.get('/admin/lab-test-categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.post('/admin/lab-test-categories/', { name, icon })
      toast.success('Category added.')
      setName('')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add category.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return
    try {
      await api.delete(`/admin/lab-test-categories/${id}/`)
      toast.success('Category deleted.')
      setCategories((p) => p.filter((c) => c.id !== id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete.')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-on-surface-variant">Health Concern / Category Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Diabetes"
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="flex items-center gap-1.5">
          {ICONS.map((ic) => (
            <button key={ic} type="button" onClick={() => setIcon(ic)}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>{ic}</span>
            </button>
          ))}
        </div>
        <button type="submit" disabled={saving || !name.trim()}
          className="px-5 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? 'Adding...' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-16 animate-pulse" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
          <p className="text-sm text-on-surface-variant">No lab test categories yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <div key={c.id} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{c.icon || 'biotech'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{c.name}</p>
                {c.test_count !== undefined && <p className="text-xs text-on-surface-variant">{c.test_count} tests</p>}
              </div>
              <button onClick={() => handleDelete(c.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 transition-colors text-error flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BookingsTab() {
  const [bookings, setBookings] = useState<LabTestBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchBookings = useCallback(() => {
    setLoading(true)
    const params: any = {}
    if (statusFilter !== 'ALL') params.status = statusFilter
    api.get('/admin/lab-test-bookings/', { params }).then((r) => setBookings(r.data.data.bookings || [])).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter])
  useEffect(() => { fetchBookings() }, [fetchBookings])

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id)
    try {
      await api.put(`/admin/lab-test-bookings/${id}/`, { status: newStatus })
      toast.success('Booking updated.')
      fetchBookings()
    } catch {
      toast.error('Failed to update booking.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {['ALL', ...BOOKING_STATUSES].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Test', 'Customer', 'Date', 'Time Slot', 'Amount', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : bookings.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No bookings found</td></tr>
              ) : bookings.map((b) => (
                <tr key={b.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">{b.lab_test?.name}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-on-surface">{b.user?.full_name}</p>
                    <p className="text-xs text-on-surface-variant">{b.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(b.scheduled_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{b.time_slot}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(b.total_amount).toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[b.status] || 'bg-surface-container text-on-surface-variant'}`}>
                      {b.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select value={b.status} onChange={(e) => updateStatus(b.id, e.target.value)} disabled={updating === b.id}
                      className="text-xs border border-outline-variant rounded-lg px-2 py-1.5 bg-surface text-on-surface focus:outline-none focus:border-secondary transition disabled:opacity-60">
                      {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
