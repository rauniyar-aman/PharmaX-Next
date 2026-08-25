'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { CampaignType, PharmacyIncentiveCampaign } from '@/types'

function inWeekStr() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function nowStr() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<PharmacyIncentiveCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [campaignType, setCampaignType] = useState<CampaignType>('DISCOUNT')
  const [discountedRate, setDiscountedRate] = useState('')
  const [bonusAmount, setBonusAmount] = useState('')
  const [startsAt, setStartsAt] = useState(nowStr())
  const [endsAt, setEndsAt] = useState(inWeekStr())

  const load = () => {
    api.get('/admin/campaigns/').then((r) => setCampaigns(r.data.data.campaigns || [])).catch(() => toast.error('Failed to load campaigns.')).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setName(''); setDescription(''); setCampaignType('DISCOUNT'); setDiscountedRate(''); setBonusAmount('')
    setStartsAt(nowStr()); setEndsAt(inWeekStr()); setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Campaign name is required.'); return }
    if (campaignType === 'DISCOUNT' && !discountedRate) { toast.error('Discounted commission rate is required.'); return }
    if (campaignType === 'BONUS' && !bonusAmount) { toast.error('Bonus amount is required.'); return }
    setSaving(true)
    try {
      await api.post('/admin/campaigns/', {
        name: name.trim(), description: description || undefined, campaign_type: campaignType,
        discounted_commission_rate: campaignType === 'DISCOUNT' ? Number(discountedRate) : undefined,
        bonus_amount: campaignType === 'BONUS' ? Number(bonusAmount) : undefined,
        starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
      })
      toast.success('Campaign created.')
      resetForm()
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat().join(', ') || 'Failed to create campaign.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: PharmacyIncentiveCampaign) => {
    try {
      await api.put(`/admin/campaigns/${c.id}/`, { is_active: !c.is_active })
      toast.success(c.is_active ? 'Campaign deactivated.' : 'Campaign activated.')
      load()
    } catch {
      toast.error('Failed to update campaign.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign? Pharmacies enrolled in it will lose the enrollment too.')) return
    try {
      await api.delete(`/admin/campaigns/${id}/`)
      toast.success('Campaign deleted.')
      setCampaigns((p) => p.filter((c) => c.id !== id))
    } catch {
      toast.error('Failed to delete campaign.')
    }
  }

  const now = Date.now()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-on-surface">Pharmacy Incentive Campaigns</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Offer specific pharmacies a time-limited reduced commission or cash bonus. Enroll pharmacies from each one's own detail page.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity flex-shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>New Campaign
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">Campaign Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Festival Season Boost"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Type</label>
              <select value={campaignType} onChange={(e) => setCampaignType(e.target.value as CampaignType)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="DISCOUNT">Reduced Commission</option>
                <option value="BONUS">Cash Bonus</option>
              </select>
            </div>
            {campaignType === 'DISCOUNT' ? (
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Discounted Commission Rate (%) *</label>
                <input type="number" min="0" max="100" step="0.01" value={discountedRate} onChange={(e) => setDiscountedRate(e.target.value)}
                  placeholder="e.g., 5"
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Bonus Amount (NPR) *</label>
                <input type="number" min="0" value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="e.g., 2000"
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Starts At</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Ends At</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Description (optional)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Internal note about this campaign"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Campaign'}
            </button>
            <button type="button" onClick={resetForm} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Type', 'Value', 'Window', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(3)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : campaigns.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant">No campaigns yet</td></tr>
              ) : campaigns.map((c) => {
                const expired = new Date(c.ends_at).getTime() < now
                return (
                  <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">
                      {c.name}
                      {c.description && <p className="text-xs text-on-surface-variant font-normal mt-0.5">{c.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{c.campaign_type === 'DISCOUNT' ? 'Reduced Commission' : 'Cash Bonus'}</td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {c.campaign_type === 'DISCOUNT' ? `${Number(c.discounted_commission_rate).toFixed(2)}%` : `NPR ${Number(c.bonus_amount).toFixed(0)}`}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                      {new Date(c.starts_at).toLocaleDateString()} – {new Date(c.ends_at).toLocaleDateString()}
                      {expired && <span className="block text-error font-semibold">Ended</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleActive(c)} className="text-xs font-semibold text-primary hover:underline">
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-xs font-semibold text-error hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
