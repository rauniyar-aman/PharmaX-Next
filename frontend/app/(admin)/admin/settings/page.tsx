'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

const SETTINGS_FIELDS = [
  { key: 'store_name', label: 'Store Name', placeholder: 'PharmaX' },
  { key: 'support_email', label: 'Support Email', placeholder: 'support@pharmax.com' },
  { key: 'support_phone', label: 'Support Phone', placeholder: '+977 9800000000' },
  { key: 'free_delivery_threshold', label: 'Free Delivery Threshold (NPR)', placeholder: '500' },
  { key: 'delivery_charge', label: 'Standard Delivery Charge (NPR)', placeholder: '50' },
  { key: 'low_stock_threshold', label: 'Low Stock Threshold (units)', placeholder: '10' },
]

export default function AdminSettingsPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [pwLoading, setPwLoading] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    if (user && !user.is_super_admin) router.replace('/admin/dashboard')
  }, [user, router])

  useEffect(() => {
    if (!user?.is_super_admin) return
    api.get('/admin/settings/').then((r) => setSettings(r.data.data.settings || {})).catch(() => {}).finally(() => setSettingsLoading(false))
  }, [user])

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const res = await api.put('/admin/settings/', settings)
      setSettings(res.data.data.settings || settings)
      toast.success('Settings saved!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save settings.')
    } finally {
      setSavingSettings(false)
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
      toast.success('Password changed!')
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  if (!user?.is_super_admin) return null

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
        <h2 className="text-sm font-bold text-on-surface">Store Settings</h2>
        {settingsLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-surface-container-low rounded-xl animate-pulse" />)}</div>
        ) : (
          <form onSubmit={handleSettingsSave} className="space-y-3">
            {SETTINGS_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-on-surface-variant">{f.label}</label>
                <input type="text" value={settings[f.key] || ''} placeholder={f.placeholder}
                  onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
              </div>
            ))}
            <button type="submit" disabled={savingSettings}
              className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
              {savingSettings ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Settings'}
            </button>
          </form>
        )}
      </div>

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
        <h2 className="text-sm font-bold text-on-surface">Session</h2>
        <p className="text-xs text-on-surface-variant">Sign out from your admin session.</p>
        <button onClick={() => { logout(); router.push('/') }}
          className="px-5 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
          Sign Out
        </button>
      </div>
    </div>
  )
}
