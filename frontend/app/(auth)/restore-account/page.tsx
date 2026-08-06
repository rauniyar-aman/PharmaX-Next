'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import AuthLayout from '@/components/common/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { User, AuthTokens } from '@/types'

function RestoreAccountForm() {
  const router = useRouter()
  const params = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const emailParam = params.get('email') || ''

  const [step, setStep] = useState<'email' | 'otp'>(emailParam ? 'otp' : 'email')
  const [email, setEmail] = useState(emailParam)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const didSend = useRef(false)

  useEffect(() => {
    if (emailParam && !didSend.current) {
      didSend.current = true
      sendOtp(emailParam)
    }
  }, [])

  const sendOtp = async (target: string) => {
    setSending(true)
    setError('')
    try {
      await api.post('/auth/restore-request/', { email: target })
      setStep('otp')
      toast.success('Verification code sent to your email.')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send verification code.')
    } finally {
      setSending(false)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Please enter your email.'); return }
    await sendOtp(email)
  }

  const handleOtpChange = (i: number, val: string) => {
    if (val.length > 1) return
    const next = [...otp]
    next[i] = val
    setOtp(next)
    if (val && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus()
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Please enter the full 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ success: boolean; tokens: AuthTokens; user: User }>('/auth/restore-confirm/', { email, otp: code })
      const { tokens, user } = res.data
      setAuth(user, tokens.access, tokens.refresh)
      toast.success('Account restored! Welcome back.')
      router.push(user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="rounded-[32px] border border-surface-container bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.2)]">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>manage_accounts</span>
            </div>
            <h1 className="text-2xl font-semibold text-on-surface">Restore Account</h1>
            <p className="text-sm text-on-surface-variant mt-2">
              {step === 'email'
                ? 'Enter your email to receive a verification code and restore your account.'
                : `We've sent a code to ${email}. Enter it below to restore your account.`}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <Input label="Email Address" type="email" placeholder="name@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
              {error && <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>}
              <Button type="submit" className="w-full" loading={sending}>Send Verification Code</Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="flex justify-center gap-3">
                {otp.map((digit, i) => (
                  <input key={i} ref={(el) => { inputs.current[i] = el }} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition" />
                ))}
              </div>

              {error && <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>}

              <Button type="submit" className="w-full" loading={loading}>Verify & Restore Account</Button>

              <button type="button" onClick={() => sendOtp(email)} disabled={sending}
                className="w-full py-2 text-sm text-primary font-medium hover:underline disabled:opacity-50">
                {sending ? 'Resending…' : 'Resend code'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-on-surface-variant">
            <Link href="/signin" className="text-primary font-semibold">← Back to Sign In</Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}

export default function RestoreAccountPage() {
  return <Suspense><RestoreAccountForm /></Suspense>
}
