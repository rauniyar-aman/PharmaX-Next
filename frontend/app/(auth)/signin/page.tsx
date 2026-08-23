'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import AuthLayout from '@/components/common/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { User, AuthTokens } from '@/types'

export default function SignIn() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setUnverified(false)
    if (!form.email || !form.password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    try {
      const res = await api.post<{ success: boolean; tokens: AuthTokens; user: User }>('/auth/login/', form)
      const { tokens, user } = res.data
      setAuth(user, tokens.access, tokens.refresh)
      router.push(
        user.role === 'ADMIN' ? '/admin/dashboard'
        : user.role === 'PHARMACY' ? '/pharmacy/dashboard'
        : user.role === 'DELIVERY_AGENT' ? '/delivery/requests'
        : user.role === 'DOCTOR' ? '/doctor/dashboard'
        : '/dashboard'
      )
    } catch (err: any) {
      const code = err.response?.data?.code
      const msg = err.response?.data?.message
      if (code === 'ACCOUNT_DELETED' || code === 'ACCOUNT_DEACTIVATED') {
        router.push(`/restore-account?email=${encodeURIComponent(form.email)}`)
        return
      }
      if (err.response?.status === 403) { setUnverified(true) }
      else { setError(msg || 'Invalid email or password.') }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="rounded-[32px] border border-surface-container bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.2)]">
          <div className="mb-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
              </span>
              Back to homepage
            </Link>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-on-surface">Sign In</h1>
            <p className="text-sm text-on-surface-variant mt-2">Use your PharmaX credentials to access the secure portal.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <Input
              label="Email Address"
              name="email"
              type="email"
              placeholder="name@example.com"
              icon={<Mail size={16} />}
              value={form.email}
              onChange={handleChange}
            />
            <Input
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock size={16} />}
              value={form.password}
              onChange={handleChange}
              right={
                <button type="button" onClick={() => setShowPassword((p) => !p)} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />

            <div className="flex items-center justify-end text-sm">
              <Link href="/forgot-password" className="text-primary font-medium">Forgot Password?</Link>
            </div>

            {unverified && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-amber-800 font-medium">Your email address hasn't been verified yet.</p>
                <button type="button"
                  onClick={() => router.push(`/verify-email?email=${encodeURIComponent(form.email)}`)}
                  className="w-full py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors">
                  Verify Email Now →
                </button>
              </div>
            )}

            {error && (
              <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="mt-7 text-center text-sm text-on-surface-variant">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary font-semibold">Register now</Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
