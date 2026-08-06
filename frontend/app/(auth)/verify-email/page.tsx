'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import AuthLayout from '@/components/common/AuthLayout'
import Button from '@/components/ui/Button'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { User, AuthTokens } from '@/types'

function VerifyEmailForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') || ''
  const setAuth = useAuthStore((s) => s.setAuth)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  const handleOtpChange = (i: number, val: string) => {
    if (val.length > 1) return
    const next = [...otp]
    next[i] = val
    setOtp(next)
    if (val && i < 5) {
      const el = document.getElementById(`otp-${i + 1}`)
      el?.focus()
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      document.getElementById(`otp-${i - 1}`)?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Please enter the 6-digit code.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await api.post<{ success: boolean; tokens: AuthTokens; user: User }>('/auth/verify-email/', { email, otp: code })
      setAuth(res.data.user, res.data.tokens.access, res.data.tokens.refresh)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-otp/', { email })
      setResendCooldown(60)
      setError('')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="rounded-[32px] border border-surface-container bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.2)] text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '32px' }}>mark_email_unread</span>
          </div>
          <h1 className="text-2xl font-semibold text-on-surface">Verify your email</h1>
          <p className="text-sm text-on-surface-variant mt-2 mb-8">
            We sent a 6-digit code to <span className="font-medium text-on-surface">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center gap-3">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition"
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>Verify Email</Button>
          </form>

          <div className="mt-6 text-sm text-on-surface-variant">
            Didn&apos;t receive the code?{' '}
            {resendCooldown > 0 ? (
              <span className="text-on-surface-variant">Resend in {resendCooldown}s</span>
            ) : (
              <button onClick={handleResend} disabled={resending} className="text-primary font-semibold disabled:opacity-60">
                {resending ? 'Sending…' : 'Resend'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  )
}
