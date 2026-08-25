'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Coupon, DiscountType, FeaturedDeal, FeaturedDealTargetType, PromoBanner } from '@/types'

const TABS = ['Coupons', 'Featured Deals', 'Banners', 'Wallets'] as const
type Tab = typeof TABS[number]

export default function AdminMarketingPage() {
  const [tab, setTab] = useState<Tab>('Coupons')
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
      {tab === 'Coupons' && <CouponsTab />}
      {tab === 'Featured Deals' && <FeaturedDealsTab />}
      {tab === 'Banners' && <BannersTab />}
      {tab === 'Wallets' && <WalletsTab />}
    </div>
  )
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function in30DaysStr() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState('')
  const [minOrderAmount, setMinOrderAmount] = useState('0')
  const [maxDiscountAmount, setMaxDiscountAmount] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [perUserLimit, setPerUserLimit] = useState('1')
  const [validFrom, setValidFrom] = useState(todayStr())
  const [validUntil, setValidUntil] = useState(in30DaysStr())

  const load = () => {
    api.get('/admin/coupons/').then((r) => setCoupons(r.data.data.coupons || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setCode(''); setDescription(''); setDiscountType('PERCENTAGE'); setDiscountValue('')
    setMinOrderAmount('0'); setMaxDiscountAmount(''); setUsageLimit(''); setPerUserLimit('1')
    setValidFrom(todayStr()); setValidUntil(in30DaysStr()); setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !discountValue) { toast.error('Code and discount value are required.'); return }
    setSaving(true)
    try {
      await api.post('/admin/coupons/', {
        code: code.trim().toUpperCase(), description: description || undefined,
        discount_type: discountType, discount_value: Number(discountValue),
        min_order_amount: Number(minOrderAmount) || 0,
        max_discount_amount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
        usage_limit: usageLimit ? Number(usageLimit) : undefined,
        per_user_limit: Number(perUserLimit) || 1,
        valid_from: new Date(validFrom).toISOString(), valid_until: new Date(validUntil).toISOString(),
      })
      toast.success('Coupon created!')
      resetForm()
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat().join(', ') || 'Failed to create coupon.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: Coupon) => {
    try {
      await api.put(`/admin/coupons/${c.id}/`, { is_active: !c.is_active })
      toast.success(c.is_active ? 'Coupon deactivated.' : 'Coupon activated.')
      load()
    } catch {
      toast.error('Failed to update coupon.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coupon?')) return
    try {
      await api.delete(`/admin/coupons/${id}/`)
      toast.success('Coupon deleted.')
      setCoupons((p) => p.filter((c) => c.id !== id))
    } catch {
      toast.error('Failed to delete coupon.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{coupons.length} coupons</p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Coupon
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Coupon Code *</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g., WELCOME50"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Discount Type</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat Amount</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Discount Value *</label>
              <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENTAGE' ? 'e.g., 10 (%)' : 'e.g., 100 (NPR)'}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Min Order Amount</label>
              <input type="number" min="0" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            {discountType === 'PERCENTAGE' && (
              <div>
                <label className="text-xs font-medium text-on-surface-variant">Max Discount Cap (optional)</label>
                <input type="number" min="0" value={maxDiscountAmount} onChange={(e) => setMaxDiscountAmount(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Total Usage Limit (optional)</label>
              <input type="number" min="1" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Per-User Limit</label>
              <input type="number" min="1" value={perUserLimit} onChange={(e) => setPerUserLimit(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Valid From</label>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Valid Until</label>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} min={validFrom}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Description (optional)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Welcome offer for new customers"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Coupon'}
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
                {['Code', 'Discount', 'Min Order', 'Usage', 'Valid Until', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : coupons.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No coupons yet</td></tr>
              ) : coupons.map((c) => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-on-surface">{c.code}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {c.discount_type === 'PERCENTAGE' ? `${Number(c.discount_value).toFixed(0)}%` : `NPR ${Number(c.discount_value).toFixed(0)}`}
                    {c.max_discount_amount && ` (cap NPR ${Number(c.max_discount_amount).toFixed(0)})`}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">NPR {Number(c.min_order_amount).toFixed(0)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{c.times_used || 0}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(c.valid_until).toLocaleDateString()}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

interface TargetOption { id: string; label: string }

function FeaturedDealsTab() {
  const [deals, setDeals] = useState<FeaturedDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [targetType, setTargetType] = useState<FeaturedDealTargetType>('MEDICINE')
  const [targetId, setTargetId] = useState('')
  const [targetLabel, setTargetLabel] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [targetResults, setTargetResults] = useState<TargetOption[]>([])
  const [badgeText, setBadgeText] = useState('')
  const [displayOrder, setDisplayOrder] = useState('0')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const load = () => {
    api.get('/admin/featured-deals/').then((r) => setDeals(r.data.data.featured_deals || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Reset the target picker whenever the target type changes — a leftover medicine_id from a
  // previous selection has no meaning once the admin switches to, say, Doctor Consult.
  useEffect(() => {
    setTargetId(''); setTargetLabel(''); setTargetSearch(''); setTargetResults([])
  }, [targetType])

  // DOCTOR and PLUS_PLAN both have small enough catalogs to just load the full list into a
  // <select>; MEDICINE and LAB_TEST get a live search instead (see the effect below).
  useEffect(() => {
    if (targetType === 'PLUS_PLAN') {
      api.get('/plus/plans/').then((r) => setTargetResults((r.data.data.plans || []).map((p: any) => ({ id: p.id, label: `${p.name} — NPR ${Number(p.price).toFixed(0)}` })))).catch(() => {})
    } else if (targetType === 'DOCTOR') {
      api.get('/doctors/').then((r) => setTargetResults((r.data.data.doctors || []).map((d: any) => ({ id: d.id, label: `Dr. ${d.name} (${d.specialty})` })))).catch(() => {})
    }
  }, [targetType])

  useEffect(() => {
    if (targetType !== 'MEDICINE' && targetType !== 'LAB_TEST') return
    if (!targetSearch.trim()) { setTargetResults([]); return }
    const endpoint = targetType === 'MEDICINE' ? '/medicines/' : '/lab-tests/'
    const t = setTimeout(() => {
      api.get(endpoint, { params: { search: targetSearch, limit: 10 } }).then((r) => {
        const list = r.data.data.medicines || r.data.data.labTests || []
        setTargetResults(list.map((item: any) => ({
          id: item.id,
          label: targetType === 'MEDICINE' ? `${item.name}${item.brand_name ? ` (${item.brand_name})` : ''}` : item.name,
        })))
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [targetSearch, targetType])

  const resetForm = () => {
    setTargetType('MEDICINE'); setTargetId(''); setTargetLabel(''); setTargetSearch(''); setTargetResults([])
    setBadgeText(''); setDisplayOrder('0'); setStartsAt(''); setEndsAt(''); setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetId) { toast.error('Pick a target first.'); return }
    setSaving(true)
    const idField = targetType === 'MEDICINE' ? 'medicine_id' : targetType === 'DOCTOR' ? 'doctor_id' : targetType === 'LAB_TEST' ? 'lab_test_id' : 'plus_plan_id'
    try {
      await api.post('/admin/featured-deals/', {
        target_type: targetType, [idField]: targetId,
        badge_text: badgeText || undefined, display_order: Number(displayOrder) || 0,
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
      })
      toast.success('Featured deal added.')
      resetForm()
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || Object.values(err.response?.data?.errors || {}).flat().join(', ') || 'Failed to add deal.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (d: FeaturedDeal) => {
    try {
      await api.put(`/admin/featured-deals/${d.id}/`, { is_active: !d.is_active })
      toast.success(d.is_active ? 'Deal deactivated.' : 'Deal activated.')
      load()
    } catch {
      toast.error('Failed to update deal.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this featured deal?')) return
    try {
      await api.delete(`/admin/featured-deals/${id}/`)
      toast.success('Deal deleted.')
      setDeals((p) => p.filter((d) => d.id !== id))
    } catch {
      toast.error('Failed to delete deal.')
    }
  }

  const dealTitle = (d: FeaturedDeal) => {
    if (d.target_type === 'MEDICINE') return d.medicine?.name
    if (d.target_type === 'DOCTOR') return d.doctor ? `Dr. ${d.doctor.name}` : ''
    if (d.target_type === 'LAB_TEST') return d.lab_test?.name
    if (d.target_type === 'PLUS_PLAN') return d.plus_plan?.name
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{deals.length} featured deals</p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Featured Deal
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Target Type</label>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as FeaturedDealTargetType)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="MEDICINE">Medicine</option>
                <option value="DOCTOR">Doctor Consult</option>
                <option value="LAB_TEST">Lab Test</option>
                <option value="PLUS_PLAN">Plus Membership</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">
                {targetType === 'PLUS_PLAN' ? 'Plan' : targetType === 'DOCTOR' ? 'Doctor' : targetType === 'LAB_TEST' ? 'Lab Test' : 'Medicine'} *
              </label>
              {targetId ? (
                <div className="mt-1 flex items-center justify-between gap-2 px-3 py-2.5 border border-primary/40 bg-primary/5 rounded-xl text-sm text-on-surface">
                  <span className="truncate">{targetLabel}</span>
                  <button type="button" onClick={() => { setTargetId(''); setTargetLabel('') }} className="text-xs font-semibold text-error flex-shrink-0">Change</button>
                </div>
              ) : targetType === 'PLUS_PLAN' || targetType === 'DOCTOR' ? (
                <select value="" onChange={(e) => {
                  const opt = targetResults.find((r) => r.id === e.target.value)
                  if (opt) { setTargetId(opt.id); setTargetLabel(opt.label) }
                }} className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                  <option value="" disabled>Select...</option>
                  {targetResults.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              ) : (
                <div className="relative">
                  <input type="text" value={targetSearch} onChange={(e) => setTargetSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                  {targetResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-surface border border-outline-variant rounded-xl shadow-lg">
                      {targetResults.map((r) => (
                        <button key={r.id} type="button" onClick={() => { setTargetId(r.id); setTargetLabel(r.label); setTargetResults([]) }}
                          className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors">
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Badge Text (optional)</label>
              <input type="text" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="e.g., 30% OFF"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Display Order</label>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Starts At (optional)</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Ends At (optional)</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || !targetId}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Add Deal'}
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
                {['Target', 'Type', 'Badge', 'Order', 'Window', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(3)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : deals.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">No featured deals yet</td></tr>
              ) : deals.map((d) => (
                <tr key={d.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">{dealTitle(d)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.target_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.badge_text || '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{d.display_order}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                    {d.starts_at ? new Date(d.starts_at).toLocaleDateString() : 'Any'} – {d.ends_at ? new Date(d.ends_at).toLocaleDateString() : 'Any'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(d)} className="text-xs font-semibold text-primary hover:underline">
                        {d.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => handleDelete(d.id)} className="text-xs font-semibold text-error hover:underline">Delete</button>
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

const ICON_OPTIONS = ['description', 'sell', 'workspace_premium', 'water_drop', 'biotech', 'stethoscope', 'local_shipping', 'favorite', 'health_and_safety']
const GRADIENT_OPTIONS = [
  { label: 'Primary', value: 'from-primary to-primary/70' },
  { label: 'Secondary', value: 'from-secondary to-secondary/70' },
  { label: 'Amber', value: 'from-amber-500 to-amber-600' },
  { label: 'Purple', value: 'from-purple-500 to-purple-700' },
  { label: 'Cyan', value: 'from-cyan-600 to-cyan-700' },
  { label: 'Rose', value: 'from-rose-500 to-rose-600' },
]

function BannersTab() {
  const [banners, setBanners] = useState<PromoBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [cta, setCta] = useState('')
  const [href, setHref] = useState('')
  const [icon, setIcon] = useState(ICON_OPTIONS[0])
  const [gradient, setGradient] = useState(GRADIENT_OPTIONS[0].value)
  const [displayOrder, setDisplayOrder] = useState('0')

  const load = () => {
    api.get('/admin/promo-banners/').then((r) => setBanners(r.data.data.banners || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setTitle(''); setSubtitle(''); setCta(''); setHref(''); setIcon(ICON_OPTIONS[0]); setGradient(GRADIENT_OPTIONS[0].value)
    setDisplayOrder('0'); setShowForm(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !subtitle.trim() || !cta.trim() || !href.trim()) { toast.error('Title, subtitle, CTA, and link are required.'); return }
    setSaving(true)
    try {
      await api.post('/admin/promo-banners/', {
        title: title.trim(), subtitle: subtitle.trim(), cta: cta.trim(), href: href.trim(),
        icon, gradient, display_order: Number(displayOrder) || 0,
      })
      toast.success('Banner added.')
      resetForm()
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add banner.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (b: PromoBanner) => {
    try {
      await api.put(`/admin/promo-banners/${b.id}/`, { is_active: !b.is_active })
      toast.success(b.is_active ? 'Banner deactivated.' : 'Banner activated.')
      load()
    } catch {
      toast.error('Failed to update banner.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this banner?')) return
    try {
      await api.delete(`/admin/promo-banners/${id}/`)
      toast.success('Banner deleted.')
      setBanners((p) => p.filter((b) => b.id !== id))
    } catch {
      toast.error('Failed to delete banner.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{banners.length} homepage banners</p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Banner
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Become a Plus Member"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">Subtitle *</label>
              <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g., Unlock free delivery and exclusive discounts."
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">CTA Label *</label>
              <input type="text" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g., Learn More"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Link *</label>
              <input type="text" value={href} onChange={(e) => setHref(e.target.value)} placeholder="e.g., /plus-membership"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Display Order</label>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Icon</label>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {ICON_OPTIONS.map((ic) => (
                  <button key={ic} type="button" onClick={() => setIcon(ic)}
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>{ic}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-on-surface-variant">Gradient</label>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {GRADIENT_OPTIONS.map((g) => (
                  <button key={g.value} type="button" onClick={() => setGradient(g.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r ${g.value} text-white ${gradient === g.value ? 'ring-2 ring-offset-2 ring-primary' : 'opacity-80'}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Add Banner'}
            </button>
            <button type="button" onClick={resetForm} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-4 h-32 animate-pulse" />)}
        </div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
          <p className="text-sm text-on-surface-variant">No homepage banners yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {banners.map((b) => (
            <div key={b.id} className={`relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br ${b.gradient} text-white flex flex-col justify-between min-h-[130px]`}>
              <span className="material-symbols-outlined ms-filled absolute -right-3 -bottom-3 text-white/15" style={{ fontSize: '80px' }}>{b.icon}</span>
              <div className="relative">
                <p className="text-sm font-bold leading-snug">{b.title}</p>
                <p className="text-xs text-white/85 mt-1 leading-relaxed line-clamp-2">{b.subtitle}</p>
              </div>
              <div className="relative flex items-center justify-between mt-3">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.is_active ? 'bg-white/25' : 'bg-black/25'}`}>
                  {b.is_active ? 'Active' : 'Inactive'}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleActive(b)} className="text-[11px] font-semibold underline">
                    {b.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(b.id)} className="text-[11px] font-semibold underline">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WalletsTab() {
  const [wallets, setWallets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [adjType, setAdjType] = useState<'CREDIT' | 'DEBIT'>('CREDIT')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/wallets/', { params: search ? { search } : {} }).then((r) => setWallets(r.data.data.wallets || [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [search])

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userEmail.trim() || !amount || !reason.trim()) { toast.error('All fields are required.'); return }
    setSaving(true)
    try {
      const userRes = await api.get('/admin/customers/', { params: { search: userEmail.trim() } })
      const match = (userRes.data.data.customers || []).find((u: any) => u.email.toLowerCase() === userEmail.trim().toLowerCase())
      if (!match) { toast.error('No customer found with that email.'); setSaving(false); return }
      await api.post('/admin/wallets/adjust/', { user_id: match.id, amount: Number(amount), reason: reason.trim(), type: adjType })
      toast.success('Wallet adjusted!')
      setUserEmail(''); setAmount(''); setReason(''); setShowForm(false)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to adjust wallet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..."
          className="flex-1 min-w-[200px] max-w-sm px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Adjust Wallet
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdjust} className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Customer Email *</label>
              <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="customer@example.com"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Adjustment Type</label>
              <select value={adjType} onChange={(e) => setAdjType(e.target.value as 'CREDIT' | 'DEBIT')}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                <option value="CREDIT">Credit (Add)</option>
                <option value="DEBIT">Debit (Deduct)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Amount (NPR) *</label>
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Reason *</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Goodwill credit for delayed delivery"
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Customer', 'Balance', 'Last Updated'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : wallets.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-12 text-center text-on-surface-variant">No wallets found</td></tr>
              ) : wallets.map((w) => (
                <tr key={w.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm text-on-surface">{w.user.full_name}</p>
                    <p className="text-xs text-on-surface-variant">{w.user.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(w.balance).toFixed(0)}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(w.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
