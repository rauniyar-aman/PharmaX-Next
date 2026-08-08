'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'

export default function AddDeliveryAgentPage() {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', vehicle_type: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/delivery-agents/', form)
      toast.success('Delivery agent created! Verify them before they can accept deliveries.')
      router.push('/admin/delivery-agents')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to create delivery agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/delivery-agents" className="hover:text-primary transition-colors">Delivery Agents</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Rider</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Delivery Agent</h1>
      <p className="text-sm text-on-surface-variant">
        Creates a login account for the rider. It starts unverified — verify it from the list once you've confirmed their details.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Full Name *</label>
              <input type="text" required value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Vehicle Type</label>
              <input type="text" placeholder="Bike, Scooter, etc." value={form.vehicle_type} onChange={(e) => setForm((p) => ({ ...p, vehicle_type: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Login Email *</label>
              <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Phone *</label>
              <input type="text" required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">Temporary Password *</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Create Delivery Agent'}
          </button>
          <Link href="/admin/delivery-agents" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
