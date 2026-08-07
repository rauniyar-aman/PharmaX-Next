'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

interface AdminWallet {
  id: string
  user: { id: string; full_name: string; email: string }
  balance: string
  updated_at: string
}

export default function AdminWalletPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [wallets, setWallets] = useState<AdminWallet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adjustFor, setAdjustFor] = useState<AdminWallet | null>(null)

  useEffect(() => {
    if (user && !user.is_super_admin && !user.permission_codes?.includes('manage_finance')) {
      router.replace('/admin/dashboard')
    }
  }, [user, router])

  const canAccess = user?.is_super_admin || user?.permission_codes?.includes('manage_finance')

  const fetchWallets = useCallback(() => {
    if (!canAccess) return
    setLoading(true)
    const params: any = {}
    if (search) params.search = search
    api.get('/admin/wallets/', { params }).then((r) => setWallets(r.data.data.wallets || [])).catch(() => toast.error('Failed to load wallets.')).finally(() => setLoading(false))
  }, [search, canAccess])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  if (!canAccess) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-on-surface-variant">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</p>
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email..."
            className="w-full pl-9 pr-3 py-2 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Email', 'Balance', 'Last Updated', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : wallets.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">No wallets found</td></tr>
              ) : wallets.map((w) => (
                <tr key={w.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{w.user.full_name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{w.user.email}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">NPR {Number(w.balance).toFixed(2)}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(w.updated_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setAdjustFor(w)}
                      className="text-xs font-semibold text-primary hover:underline">
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adjustFor && (
        <AdjustModal wallet={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); fetchWallets() }} />
      )}
    </div>
  )
}

function AdjustModal({ wallet, onClose, onDone }: { wallet: AdminWallet; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/wallets/adjust/', { user_id: wallet.user.id, amount, type, reason })
      toast.success('Wallet adjusted.')
      onDone()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to adjust wallet.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 w-full max-w-sm space-y-4">
        <div>
          <p className="text-sm font-bold text-on-surface">Adjust Wallet</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{wallet.user.full_name} — {wallet.user.email}</p>
          <p className="text-xs text-on-surface-variant">Current balance: NPR {Number(wallet.balance).toFixed(2)}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-1 bg-surface-container-low rounded-xl p-1">
            {(['CREDIT', 'DEBIT'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${type === t ? (t === 'CREDIT' ? 'bg-emerald-500 text-white' : 'bg-error text-white') : 'text-on-surface-variant hover:text-on-surface'}`}>
                {t === 'CREDIT' ? 'Credit (+)' : 'Debit (−)'}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs font-medium text-on-surface-variant">Amount (NPR) *</label>
            <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>

          <div>
            <label className="text-xs font-medium text-on-surface-variant">Reason *</label>
            <textarea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Goodwill credit for delayed order"
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Confirm'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
