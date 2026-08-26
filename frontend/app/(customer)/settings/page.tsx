'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/types'

const NOTIF_PREFS = [
  { key: 'notif_order_updates', label: 'Order Updates', desc: 'Order placed, confirmed, shipped, and delivered.' },
  { key: 'notif_prescription_alerts', label: 'Prescription Alerts', desc: 'Your prescription was verified or rejected.' },
  { key: 'notif_delivery_updates', label: 'Delivery Updates', desc: 'Rider assigned, picked up, and delivered.' },
  { key: 'notif_doctor_updates', label: 'Doctor Consult Updates', desc: 'Appointment confirmed and meeting links shared.' },
  { key: 'notif_lab_test_updates', label: 'Lab Test Updates', desc: 'Booking confirmed and your report is ready.' },
  { key: 'notif_reminders', label: 'Reminders', desc: 'Medicine reminders and doctor follow-ups.' },
] as const satisfies readonly { key: keyof User; label: string; desc: string }[]

export default function SettingsPage() {
  const router = useRouter()
  const { user, setUser, logout } = useAuthStore()

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deactivating, setDeactivating] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [support, setSupport] = useState<{ support_email?: string | null; support_phone?: string | null } | null>(null)
  const [savingPref, setSavingPref] = useState<string | null>(null)

  useEffect(() => {
    api.get('/settings/').then((r) => setSupport(r.data.data)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/auth/me/').then((r) => setUser(r.data.data.user)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleNotifPref = async (key: keyof User) => {
    if (!user) return
    setSavingPref(key)
    try {
      const res = await api.put('/auth/me/', { [key]: !user[key] })
      setUser(res.data.data.user)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update preference.')
    } finally {
      setSavingPref(null)
    }
  }

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

      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-1">
        <h2 className="text-sm font-bold text-on-surface">Notification Preferences</h2>
        <p className="text-xs text-on-surface-variant">
          Choose which updates you'd like emailed to you. Your in-app notifications (bell icon) are unaffected either way.
        </p>
        <div className="divide-y divide-outline-variant pt-2">
          {NOTIF_PREFS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">{p.label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{p.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!user?.[p.key]}
                aria-label={p.label}
                onClick={() => toggleNotifPref(p.key)}
                disabled={savingPref === p.key}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 ${user?.[p.key] ? 'bg-primary' : 'bg-surface-container-highest'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${user?.[p.key] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
        </div>
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
