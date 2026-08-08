'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { PharmacyTeamMember } from '@/types'

interface TeamData {
  is_owner: boolean
  owner: { full_name: string; email: string }
  members: PharmacyTeamMember[]
  max_members: number
  my_finance_access: boolean
}

const emptyForm = { full_name: '', email: '', phone: '', password: '', can_view_finance: false }

export default function PharmacyTeamPage() {
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = () => {
    api.get('/pharmacy/team/').then((r) => setData(r.data.data)).catch(() => toast.error('Failed to load team.')).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/pharmacy/team/', form)
      toast.success('Team member added.')
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err: any) {
      const errors = err.response?.data?.errors
      const msg = err.response?.data?.message || (errors && Object.values(errors)[0]) || 'Failed to add team member.'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setSubmitting(false)
    }
  }

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from your team? They'll immediately lose access.`)) return
    setRemovingId(id)
    try {
      await api.delete(`/pharmacy/team/${id}/`)
      toast.success('Team member removed.')
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove team member.')
    } finally {
      setRemovingId(null)
    }
  }

  const toggleFinance = async (m: PharmacyTeamMember) => {
    setTogglingId(m.id)
    try {
      await api.patch(`/pharmacy/team/${m.id}/`, { can_view_finance: !m.can_view_finance })
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update access.')
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-2xl animate-pulse" />)}</div>
  }
  if (!data) return null

  const atCapacity = data.members.length >= data.max_members

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Team</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Up to {data.max_members} team members can help manage incoming requests, inventory, and orders alongside you.
          Income and payout figures stay hidden from a member unless you grant them access.
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined ms-filled text-primary" style={{ fontSize: '20px' }}>storefront</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface truncate">{data.owner.full_name}</p>
              <p className="text-xs text-on-surface-variant truncate">{data.owner.email}</p>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container whitespace-nowrap">Owner</span>
        </div>

        {data.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>person</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-on-surface truncate">{m.full_name}</p>
                <p className="text-xs text-on-surface-variant truncate">{m.email}{!m.is_active ? ' · Deactivated' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.is_owner ? (
                <button onClick={() => toggleFinance(m)} disabled={togglingId === m.id}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-colors disabled:opacity-60 ${m.can_view_finance ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                  title={m.can_view_finance ? 'Click to hide income/payouts from this member' : 'Click to let this member see income/payouts'}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>{m.can_view_finance ? 'visibility' : 'visibility_off'}</span>
                  {m.can_view_finance ? 'Sees Finance' : 'Finance Hidden'}
                </button>
              ) : (
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.can_view_finance ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                  {m.can_view_finance ? 'Sees Finance' : 'Finance Hidden'}
                </span>
              )}
              {data.is_owner && (
                <button onClick={() => removeMember(m.id, m.full_name)} disabled={removingId === m.id}
                  className="p-2 rounded-xl text-on-surface-variant hover:bg-error-container hover:text-error transition-colors disabled:opacity-60" title="Remove">
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>person_remove</span>
                </button>
              )}
            </div>
          </div>
        ))}

        {data.members.length === 0 && (
          <p className="p-4 text-sm text-on-surface-variant text-center">No team members yet.</p>
        )}
      </div>

      {!data.is_owner && (
        <p className="text-xs text-on-surface-variant">
          Only the pharmacy owner can add, remove, or change finance access for team members.
          {!data.my_finance_access && ' Income and payout figures are currently hidden from your account.'}
        </p>
      )}

      {data.is_owner && !showForm && (
        <button onClick={() => setShowForm(true)} disabled={atCapacity}
          className="w-full py-3 border-2 border-dashed border-outline-variant text-primary text-sm font-semibold rounded-2xl hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          {atCapacity ? `Team full (${data.max_members}/${data.max_members})` : '+ Add Team Member'}
        </button>
      )}

      {data.is_owner && showForm && (
        <form onSubmit={addMember} className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
          <p className="text-sm font-bold text-on-surface">New Team Member</p>
          <input required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full px-3 py-2 bg-surface-container-low rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary" />
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 bg-surface-container-low rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary" />
          <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2 bg-surface-container-low rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary" />
          <input required type="password" minLength={6} placeholder="Password (min 6 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 bg-surface-container-low rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary" />
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input type="checkbox" checked={form.can_view_finance} onChange={(e) => setForm({ ...form, can_view_finance: e.target.checked })}
              className="w-4 h-4 rounded accent-primary" />
            Let this member see income &amp; payout figures
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {submitting ? 'Adding...' : 'Add Member'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm) }}
              className="px-4 py-2 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
