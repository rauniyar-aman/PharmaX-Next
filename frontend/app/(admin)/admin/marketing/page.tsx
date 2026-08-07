'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Coupon, DiscountType } from '@/types'

const TABS = ['Coupons', 'Wallets'] as const
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
      {tab === 'Coupons' ? <CouponsTab /> : <WalletsTab />}
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
