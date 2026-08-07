'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import type { AdminUser } from '@/types'

const PERMISSION_GROUPS: Record<string, string> = {
  manage_orders: 'Orders',
  manage_prescriptions: 'Orders',
  manage_inventory: 'Catalog',
  manage_lab_tests: 'Services',
  manage_doctors: 'Services',
  manage_blog: 'Content',
  manage_marketing: 'Marketing',
  manage_subscriptions: 'Services',
  manage_plus_membership: 'Marketing',
  manage_finance: 'Finance',
  manage_customers: 'Customers',
  view_reports: 'Reports',
}

export default function AdminAdminsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && !user.is_super_admin) router.replace('/admin/dashboard')
  }, [user, router])

  useEffect(() => {
    if (!user?.is_super_admin) return
    api.get('/admin/admins/').then((r) => setAdmins(r.data.data.admins || [])).catch(() => toast.error('Failed to load admins.')).finally(() => setLoading(false))
  }, [user])

  if (!user?.is_super_admin) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-on-surface-variant">{admins.length} admin{admins.length !== 1 ? 's' : ''}</p>
        <Link href="/admin/admins/add"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>Add Admin
        </Link>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                {['Name', 'Email', 'Access', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>)
              ) : admins.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">No admins yet</td></tr>
              ) : admins.map((a) => {
                const groups = a.is_super_admin ? [] : Array.from(new Set(a.permission_codes.map((c) => PERMISSION_GROUPS[c]).filter(Boolean)))
                return (
                  <tr key={a.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">{a.full_name}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{a.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.is_super_admin ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Super Admin</span>
                        ) : groups.length === 0 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">No access</span>
                        ) : (
                          groups.map((g) => (
                            <span key={g} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{g}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-container text-on-surface-variant'}`}>
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/admins/${a.id}`}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
