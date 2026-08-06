'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { resolveImg } from '@/lib/resolveImg'

export default function MyProfilePage() {
  const { user, setUser } = useAuthStore()
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) {
      const digits = ((user as any).phone || '').replace(/\D/g, '').slice(-10)
      setForm({ full_name: user.full_name || '', phone: digits })
    }
  }, [user])

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.phone && form.phone.length !== 10) { toast.error('Enter a valid 10-digit phone number.'); return }
    setLoading(true)
    try {
      const res = await api.put('/auth/me/', { ...form, phone: form.phone ? `+977${form.phone}` : '' })
      setUser(res.data.data.user)
      toast.success('Profile updated!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Update failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) { toast.error('Only JPG, PNG, WebP, or GIF images are allowed.'); return }
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3MB.'); return }

    const formData = new FormData()
    formData.append('avatar', file)
    setAvatarLoading(true)
    try {
      const res = await api.post('/auth/avatar/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setUser(res.data.user)
      toast.success('Profile picture updated!')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload image.')
    } finally {
      setAvatarLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarLoading(true)
    try {
      await api.delete('/auth/avatar/')
      setUser({ ...(user as any), avatar_url: null })
      toast.success('Profile picture removed.')
    } catch {
      toast.error('Failed to remove image.')
    } finally {
      setAvatarLoading(false)
    }
  }

  const avatarSrc = resolveImg(user?.avatar_url)

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-2xl font-bold text-on-surface">My Profile</h1>

      <div className="bg-surface rounded-2xl border border-outline-variant p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-primary">{user?.full_name?.[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={avatarLoading}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:opacity-90 transition-opacity disabled:opacity-60">
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{avatarLoading ? 'progress_activity' : 'photo_camera'}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-base font-bold text-on-surface">{user?.full_name}</p>
            <p className="text-sm text-on-surface-variant">{user?.email}</p>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${user?.is_email_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {user?.is_email_verified ? 'Verified' : 'Email not verified'}
            </span>
            {avatarSrc && (
              <button type="button" onClick={handleRemoveAvatar} disabled={avatarLoading}
                className="block mt-1 text-[11px] text-error hover:underline disabled:opacity-60">
                Remove photo
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 pt-4 border-t border-outline-variant">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Full Name</label>
            <input type="text" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Email</label>
            <input type="email" value={user?.email || ''} disabled
              className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-sm text-on-surface-variant cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Phone</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-on-surface">+977</span>
              <input type="tel" inputMode="numeric" maxLength={10} value={form.phone} onChange={handlePhoneChange}
                placeholder="9800000000"
                className="w-full pl-16 pr-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {loading ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
