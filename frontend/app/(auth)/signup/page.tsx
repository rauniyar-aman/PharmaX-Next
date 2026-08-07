'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, Lock, User, Phone, Eye, EyeOff, Gift } from 'lucide-react'
import AuthLayout from '@/components/common/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api from '@/lib/api'

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm_password: '', referral_code: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) setForm((prev) => ({ ...prev, referral_code: ref.toUpperCase() }))
  }, [searchParams])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.full_name || !form.email || !form.phone || !form.password) { setError('All fields are required.'); return }
    if (form.phone.length !== 10) { setError('Enter a valid 10-digit phone number.'); return }
    if (form.password !== form.confirm_password) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      await api.post('/auth/register/', {
        full_name: form.full_name, email: form.email, phone: `+977${form.phone}`, password: form.password,
        referral_code: form.referral_code || undefined,
      })
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`)
    } catch (err: any) {
      if (err.response?.data?.code === 'ACCOUNT_DELETED') {
        router.push(`/restore-account?email=${encodeURIComponent(form.email)}`)
        return
      }
      const errs = err.response?.data?.errors
      if (errs) {
        const first = Object.values(errs).flat()[0]
        setError(String(first))
      } else {
        setError(err.response?.data?.message || 'Registration failed. Please try again.')
      }
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
            <h1 className="text-2xl font-semibold text-on-surface">Create Account</h1>
            <p className="text-sm text-on-surface-variant mt-2">Join PharmaX to order medicines online.</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input label="Full Name" name="full_name" placeholder="Your full name" icon={<User size={16} />} value={form.full_name} onChange={handleChange} />
            <Input label="Email Address" name="email" type="email" placeholder="name@example.com" icon={<Mail size={16} />} value={form.email} onChange={handleChange} />
            <Input label="Phone Number" name="phone" type="tel" inputMode="numeric" placeholder="9800000000" maxLength={10}
              icon={<Phone size={16} />} prefix="+977" value={form.phone} onChange={handlePhoneChange} />
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
            <Input
              label="Confirm Password"
              name="confirm_password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock size={16} />}
              value={form.confirm_password}
              onChange={handleChange}
              right={
                <button type="button" onClick={() => setShowConfirmPassword((p) => !p)} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <Input label="Referral Code (optional)" name="referral_code" placeholder="e.g., RAHUL123" icon={<Gift size={16} />}
              value={form.referral_code} onChange={(e) => setForm((prev) => ({ ...prev, referral_code: e.target.value.toUpperCase() }))} />

            {error && (
              <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>

          <div className="mt-7 text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link href="/signin" className="text-primary font-semibold">Sign in</Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}

export default function SignUp() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}
