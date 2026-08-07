'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { Permission } from '@/types'

export default function AddAdminPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(true)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user && !user.is_super_admin) router.replace('/admin/dashboard')
  }, [user, router])

  useEffect(() => {
    if (!user?.is_super_admin) return
    api.get('/admin/permissions/').then((r) => setPermissions(r.data.data.permissions || [])).catch(() => toast.error('Failed to load permissions.')).finally(() => setLoadingPermissions(false))
  }, [user])

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.group] ||= []).push(p)
    return acc
  }, {})

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/admin/admins/', {
        full_name: fullName, email, phone, password,
        is_super_admin: isSuperAdmin,
        permission_codes: Array.from(selectedCodes),
      })
      toast.success('Admin created!')
      router.push('/admin/admins')
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.errors ? Object.values(data.errors).flat().join(', ') : data?.message || 'Failed to create admin.')
    } finally {
      setSaving(false)
    }
  }

  if (!user?.is_super_admin) return null

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/admins" className="hover:text-primary transition-colors">Admins</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Add Admin</span>
      </div>
      <h1 className="text-2xl font-bold text-on-surface">Add New Admin</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Full Name *</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Email *</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Phone *</label>
              <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
            <div>
              <label className="text-xs font-medium text-on-surface-variant">Password *</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition" />
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border p-5 space-y-3 ${isSuperAdmin ? 'border-amber-300 bg-amber-50' : 'border-outline-variant bg-surface'}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={isSuperAdmin} onChange={(e) => setIsSuperAdmin(e.target.checked)} className="mt-0.5 accent-amber-600" />
            <div>
              <p className="text-sm font-bold text-on-surface">Super Admin</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Grants unrestricted access to every admin feature, including Settings and Admin Management,
                regardless of the permission checklist below. Only grant this to someone fully trusted.
              </p>
            </div>
          </label>
        </div>

        <div className={`bg-surface rounded-2xl border border-outline-variant p-5 space-y-4 ${isSuperAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm font-bold text-on-surface">Permissions</p>
          {loadingPermissions ? (
            <div className="h-24 bg-surface-container-low rounded-xl animate-pulse" />
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([group, perms]) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {perms.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-outline-variant cursor-pointer hover:bg-surface-container-low transition-colors">
                        <input type="checkbox" checked={selectedCodes.has(p.code)} onChange={() => toggleCode(p.code)} className="accent-primary" />
                        <span className="text-sm text-on-surface">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />Saving...</> : 'Create Admin'}
          </button>
          <Link href="/admin/admins" className="px-6 py-2.5 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-xl hover:bg-surface-container transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
