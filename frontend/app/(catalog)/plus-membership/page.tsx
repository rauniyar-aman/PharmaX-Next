'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { PlusPlan, PlusMembership } from '@/types'

const BENEFITS = [
  { icon: 'local_shipping', title: 'Free Delivery', desc: 'Free delivery on every order, no minimum spend.' },
  { icon: 'support_agent', title: 'Priority Support', desc: 'Skip the queue with priority customer support.' },
  { icon: 'sell', title: 'Exclusive Discounts', desc: 'Member-only deals on medicines, lab tests and more.' },
  { icon: 'bolt', title: 'Faster Delivery', desc: 'Priority dispatch on all your orders.' },
]

export default function PlusMembershipPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [plans, setPlans] = useState<PlusPlan[]>([])
  const [membership, setMembership] = useState<PlusMembership | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  useEffect(() => {
    api.get('/plus/plans/').then((r) => setPlans(r.data.data.plans || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) { setMembership(null); return }
    api.get('/plus/membership/').then((r) => setMembership(r.data.data.membership)).catch(() => setMembership(null))
  }, [user])

  const handleSubscribe = async (planId: string) => {
    if (!user) { router.push('/signin'); return }
    setSubscribing(planId)
    try {
      const r = await api.post('/plus/membership/', { plan_id: planId })
      setMembership(r.data.data.membership)
      toast.success('Welcome to PharmaX Plus!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not activate membership.')
    } finally {
      setSubscribing(null)
    }
  }

  const isActiveMember = membership && membership.is_active

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-8 text-white text-center space-y-2">
        <span className="material-symbols-outlined ms-filled" style={{ fontSize: '48px' }}>workspace_premium</span>
        <h1 className="text-3xl font-bold">PharmaX Plus</h1>
        <p className="text-sm opacity-90 max-w-lg mx-auto">Unlock free delivery, exclusive discounts and priority support on every order.</p>
      </div>

      {isActiveMember && membership && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
          <span className="material-symbols-outlined ms-filled text-emerald-600" style={{ fontSize: '28px' }}>verified</span>
          <div>
            <p className="text-sm font-bold text-emerald-700">You're a PharmaX Plus member!</p>
            <p className="text-xs text-emerald-600">Your {membership.plan.name} plan is active until {new Date(membership.expires_at).toLocaleDateString()}.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="bg-surface rounded-2xl border border-outline-variant p-5 text-center space-y-2">
            <span className="material-symbols-outlined text-amber-600" style={{ fontSize: '32px' }}>{b.icon}</span>
            <p className="text-sm font-bold text-on-surface">{b.title}</p>
            <p className="text-xs text-on-surface-variant leading-relaxed">{b.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-on-surface text-center">Choose Your Plan</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[...Array(3)].map((_, i) => <div key={i} className="bg-surface rounded-2xl border border-outline-variant p-6 h-48 animate-pulse" />)}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-sm text-on-surface-variant">No plans available right now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {plans.map((p) => (
              <div key={p.id} className="bg-surface rounded-2xl border border-outline-variant p-6 text-center space-y-3 flex flex-col">
                <p className="text-sm font-bold text-on-surface">{p.name}</p>
                <p className="text-3xl font-bold text-on-surface">NPR {Number(p.price).toFixed(0)}</p>
                <p className="text-xs text-on-surface-variant">{p.duration_days} days</p>
                {p.description && <p className="text-xs text-on-surface-variant">{p.description}</p>}
                {p.benefits && p.benefits.length > 0 && (
                  <ul className="flex-1 text-left space-y-1.5 pt-1">
                    {p.benefits.map((b) => (
                      <li key={b.id} className="flex items-start gap-1.5 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined ms-filled text-emerald-600 flex-shrink-0" style={{ fontSize: '15px' }}>check_circle</span>
                        {b.description}
                      </li>
                    ))}
                  </ul>
                )}
                {(!p.benefits || p.benefits.length === 0) && <div className="flex-1" />}
                <button onClick={() => handleSubscribe(p.id)} disabled={subscribing === p.id}
                  className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {subscribing === p.id ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Activating...</> : isActiveMember ? 'Extend Plan' : 'Get Plus'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
