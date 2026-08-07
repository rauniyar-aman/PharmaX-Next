'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Wallet } from '@/types'

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/wallet/').then((r) => setWallet(r.data.data.wallet)).catch(() => toast.error('Failed to load wallet.')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_balance_wallet</span>
          PharmaX Wallet
        </div>
        <p className="text-3xl font-bold mt-2">NPR {Number(wallet?.balance || 0).toFixed(2)}</p>
        <p className="text-xs opacity-80 mt-1">Use your wallet balance at checkout to pay for orders.</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">Transaction History</h2>
        {!wallet?.transactions.length ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>receipt_long</span>
            <p className="text-base font-medium text-on-surface mt-3">No transactions yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Wallet credits and debits will appear here</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {wallet.transactions.map((t) => (
              <div key={t.id} className="flex items-center gap-4 p-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${t.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-error/10 text-error'}`}>
                  <span className="material-symbols-outlined ms-filled" style={{ fontSize: '18px' }}>
                    {t.type === 'CREDIT' ? 'add' : 'remove'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface">{t.reason}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{new Date(t.created_at).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${t.type === 'CREDIT' ? 'text-emerald-600' : 'text-error'}`}>
                    {t.type === 'CREDIT' ? '+' : '−'} NPR {Number(t.amount).toFixed(0)}
                  </p>
                  <p className="text-xs text-on-surface-variant">Balance: NPR {Number(t.balance_after).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
