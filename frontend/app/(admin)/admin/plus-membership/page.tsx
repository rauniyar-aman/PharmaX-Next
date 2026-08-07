'use client'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PlusPlan, PlusMembership } from '@/types'

const TABS = ['Plans', 'Members'] as const
type Tab = typeof TABS[number]

export default function AdminPlusMembershipPage() {
  const [tab, setTab] = useState<Tab>('Plans')
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
      {tab === 'Plans' ? <PlansTab /> : <MembersTab />}
    </div>
  )
}

function PlansTab() {
  const [plans, setPlans] = useState<PlusPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [durationDays, setDurationDays] = useState('30')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.get('/admin/plus-plans/').then((r) => setPlans(r.data.data.plans || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !price) return
    setSaving(true)
    try {
      await api.post('/admin/plus-plans/', { name, duration_days: Number(durationDays), price: Number(price), description: description || undefined })
      toast.success('Plan added.')
      setName(''); setPrice(''); setDescription('')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add plan.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (plan: PlusPlan) => {
    try {
      await api.put(`/admin/plus-plans/${plan.id}/`, { is_active: !plan.is_active })
      toast.success(plan.is_active ? 'Plan deactivated.' : 'Plan activated.')
      load()
    } catch {
      toast.error('Failed to update plan.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan?')) return
    try {
      await api.delete(`/admin/plus-plans/${id}/`)
      toast.success('Plan deleted.')
      setPlans((p) => p.filter((pl) => pl.id !== id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete plan.')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-on-surface-variant">Plan Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., 3 Months Plus"
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="w-32">
          <label className="text-xs font-medium text-on-surface-variant">Duration (days)</label>
          <input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="w-32">
          <label className="text-xs font-medium text-on-surface-variant">Price (NPR)</label>
          <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-on-surface-variant">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Free delivery + priority support"
            className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
        </div>
        <button type="submit" disabled={saving || !name.trim() || !price}
          className="px-5 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? 'Adding...' : 'Add Plan'}
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-24 animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
          <p className="text-sm text-on-surface-variant">No plans yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.id} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-on-surface">{p.name}</p>
                  <p className="text-xs text-on-surface-variant">{p.duration_days} days</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-lg font-bold text-on-surface">NPR {Number(p.price).toFixed(0)}</p>
              {p.description && <p className="text-xs text-on-surface-variant">{p.description}</p>}
              <div className="flex items-center gap-2 pt-2 border-t border-outline-variant">
                <button onClick={() => toggleActive(p)} className="text-xs font-semibold text-primary hover:underline">
                  {p.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-xs font-semibold text-error hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MembersTab() {
  const [members, setMembers] = useState<PlusMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')

  const fetchMembers = useCallback(() => {
    setLoading(true)
    const params: any = {}
    if (statusFilter === 'ACTIVE') params.status = 'active'
    if (statusFilter === 'EXPIRED') params.status = 'expired'
    api.get('/admin/plus-memberships/', { params }).then((r) => setMembers(r.data.data.memberships || [])).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter])
  useEffect(() => { fetchMembers() }, [fetchMembers])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {['ALL', 'ACTIVE', 'EXPIRED'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Customer', 'Plan', 'Started', 'Expires', 'Price Paid', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : members.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">No members found</td></tr>
              ) : members.map((m) => (
                <tr key={m.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm text-on-surface">{m.user?.full_name}</p>
                    <p className="text-xs text-on-surface-variant">{m.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.plan?.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(m.started_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(m.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(m.price_paid).toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
                      {m.is_active ? 'Active' : 'Expired'}
                    </span>
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
