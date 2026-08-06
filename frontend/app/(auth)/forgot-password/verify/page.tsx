'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import AuthLayout from '@/components/common/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api from '@/lib/api'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') || ''
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(60)

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  const handleResend = async () => {
    setResending(true)
    setError('')
    try {
      await api.post('/auth/forgot-password/', { email })
      setOtp(['', '', '', '', '', ''])
      document.getElementById('otp-0')?.focus()
      setResendCooldown(60)
      toast.success('A new code has been sent — the old one no longer works.')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  const handleOtpChange = (i: number, val: string) => {
    if (val.length > 1) return
    const next = [...otp]
    next[i] = val
    setOtp(next)
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) document.getElementById(`otp-${i - 1}`)?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Enter the 6-digit code.'); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password/', { email, otp: code, new_password: newPassword })
      router.push('/signin')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="rounded-[32px] border border-surface-container bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.2)] text-center">
          <h1 className="text-2xl font-semibold text-on-surface mb-2">Reset Password</h1>
          <p className="text-sm text-on-surface-variant mb-8">Enter the code sent to <span className="font-medium text-on-surface">{email}</span></p>

          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            <div className="flex justify-center gap-3">
              {otp.map((digit, i) => (
                <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition"
                />
              ))}
            </div>

            <Input label="New Password" type="password" placeholder="••••••••" icon={<Lock size={16} />}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />

            {error && (
              <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>Reset Password</Button>
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

export default function ForgotPasswordVerifyPage() {
  return <Suspense><ResetPasswordForm /></Suspense>
}
