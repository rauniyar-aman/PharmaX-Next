'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function SettingsPage() {
  const router = useRouter()
  const { logout } = useAuthStore()

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [support, setSupport] = useState<{ support_email?: string | null; support_phone?: string | null } | null>(null)

  useEffect(() => {
    api.get('/settings/').then((r) => setSupport(r.data.data)).catch(() => {})
  }, [])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) { toast.error('Passwords do not match.'); return }
    if (passwords.new_password.length < 8) { toast.error('Password must be at least 8 characters.'); return }
    setPwLoading(true)
    try {
      await api.post('/auth/change-password/', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      })
      toast.success('Password changed successfully!')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    try {
      await api.delete('/auth/me/')
      logout()
      router.push('/')
    } catch {
      toast.error('Failed to delete account.')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeactivateAccount = async () => {
    setDeactivating(true)
    try {
      await api.post('/auth/deactivate/')
      logout()
      toast.success('Account deactivated. Sign in again anytime to reactivate.')
      router.push('/signin')
    } catch {
      toast.error('Failed to deactivate account.')
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-2xl font-bold text-on-surface">Settings</h1>

      {(support?.support_email || support?.support_phone) && (
        <div className="bg-secondary/5 border border-secondary/20 rounded-2xl p-5 space-y-1.5">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>support_agent</span>
            Need Help?
          </h2>
          {support.support_email && <p className="text-xs text-on-surface-variant">Email: <a href={`mailto:${support.support_email}`} className="text-secondary hover:underline">{support.support_email}</a></p>}
          {support.support_phone && <p className="text-xs text-on-surface-variant">Phone: <a href={`tel:${support.support_phone}`} className="text-secondary hover:underline">{support.support_phone}</a></p>}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <h2 className="text-sm font-bold text-on-surface">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {[
            { key: 'current_password', label: 'Current Password' },
            { key: 'new_password', label: 'New Password' },
            { key: 'confirm', label: 'Confirm New Password' },
          ].map((f) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
              <input type="password" value={(passwords as any)[f.key]}
                onChange={(e) => setPasswords((p) => ({ ...p, [f.key]: e.target.value }))} required
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          ))}
          <button type="submit" disabled={pwLoading}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {pwLoading ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
        <h2 className="text-sm font-bold text-on-surface">Deactivate Account</h2>
        <p className="text-xs text-on-surface-variant">Temporarily disable your account. Your data is kept safe — sign in again anytime to reactivate.</p>
        {!showDeactivateConfirm ? (
          <button onClick={() => setShowDeactivateConfirm(true)}
            className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Deactivate My Account
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleDeactivateAccount} disabled={deactivating}
              className="px-5 py-2.5 bg-on-surface text-surface text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
              {deactivating ? 'Deactivating...' : 'Confirm Deactivate'}
            </button>
            <button onClick={() => setShowDeactivateConfirm(false)}
              className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-error/30 p-5 space-y-3">
        <h2 className="text-sm font-bold text-error">Danger Zone</h2>
        <p className="text-xs text-on-surface-variant">Deleting your account is permanent and cannot be undone. All your data including orders, prescriptions, and reviews will be removed.</p>
        {!showDeleteConfirm ? (
          <button onClick={() => setShowDeleteConfirm(true)}
            className="px-5 py-2.5 border border-error text-error text-sm font-semibold rounded-xl hover:bg-error/10 transition-colors">
            Delete My Account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-error font-medium">Type <strong>DELETE</strong> to confirm:</p>
            <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full px-3 py-2.5 border border-error/40 rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-error" />
            <div className="flex gap-2">
              <button onClick={handleDeleteAccount} disabled={deleteInput !== 'DELETE' || deleting}
                className="px-5 py-2.5 bg-error text-on-error text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60">
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}
                className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
