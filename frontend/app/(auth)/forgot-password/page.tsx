'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import AuthLayout from '@/components/common/AuthLayout'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import api from '@/lib/api'

export default function ForgotPassword() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Please enter your email.'); return }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password/', { email })
      router.push(`/forgot-password/verify?email=${encodeURIComponent(email)}`)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send reset code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="rounded-[32px] border border-surface-container bg-surface p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.2)]">
          <div className="mb-6">
            <Link href="/signin" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
              </span>
              Back to sign in
            </Link>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-on-surface">Forgot Password?</h1>
            <p className="text-sm text-on-surface-variant mt-2">Enter your email and we'll send you a reset code.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              icon={<Mail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && (
              <p className="text-xs text-error bg-error-container/30 border border-error-container rounded-xl px-4 py-2.5">{error}</p>
            )}

            <Button type="submit" className="w-full" loading={loading}>Send Reset Code</Button>
          </form>
        </div>
      </div>
    </AuthLayout>
  )
}
