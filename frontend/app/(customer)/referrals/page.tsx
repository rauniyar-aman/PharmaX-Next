'use client'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import type { Referral } from '@/types'

export default function ReferralsPage() {
  const [referralCode, setReferralCode] = useState('')
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [totalEarned, setTotalEarned] = useState('0')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get('/referrals/').then((r) => {
      setReferralCode(r.data.data.referral_code || '')
      setReferrals(r.data.data.referrals || [])
      setTotalEarned(r.data.data.total_earned || '0')
    }).catch(() => toast.error('Failed to load referral data.')).finally(() => setLoading(false))
  }, [])

  const handleCopy = () => {
    const link = typeof window !== 'undefined' ? `${window.location.origin}/signup?ref=${referralCode}` : referralCode
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Referral link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-2xl p-6 text-white text-center space-y-2">
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '40px' }}>redeem</span>
        <h1 className="text-2xl font-bold">Refer & Earn</h1>
        <p className="text-sm opacity-90 max-w-md mx-auto">Share your code with friends. When they place their first order, you both get wallet credit!</p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">Your Referral Code</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 border-2 border-dashed border-primary/40 rounded-xl bg-primary/5 text-center">
            <span className="text-xl font-bold text-primary tracking-widest">{referralCode}</span>
          </div>
          <button onClick={handleCopy}
            className="px-4 py-3 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-on-surface-variant">Total Earned from Referrals</p>
          <p className="text-2xl font-bold text-emerald-600 mt-0.5">NPR {Number(totalEarned).toFixed(0)}</p>
        </div>
        <span className="material-symbols-outlined text-emerald-500" style={{ fontSize: '36px' }}>trending_up</span>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-on-surface uppercase tracking-wide">Your Referrals ({referrals.length})</h2>
        {referrals.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-2xl border border-outline-variant">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>group_add</span>
            <p className="text-base font-medium text-on-surface mt-3">No referrals yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Share your code above to start earning.</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {referrals.map((r) => (
              <div key={r.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold">{r.referred_user.full_name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{r.referred_user.full_name}</p>
                  <p className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.status === 'REWARDED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {r.status === 'REWARDED' ? 'Rewarded' : 'Pending First Order'}
                  </span>
                  {r.reward_amount && <p className="text-xs font-semibold text-emerald-600 mt-1">+NPR {Number(r.reward_amount).toFixed(0)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
