'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'

const ACTION_CFG: Record<string, { label: string; color: string; icon: string }> = {
  ADD:      { label: 'Added',     color: 'bg-primary/10 text-primary',   icon: 'add_circle' },
  SUBTRACT: { label: 'Removed',   color: 'bg-error/10 text-error',       icon: 'remove_circle' },
  SET:      { label: 'Set',       color: 'bg-secondary/10 text-secondary', icon: 'tune' },
}

export default function InventoryLogPage() {
  const { id } = useParams<{ id: string }>()
  const [medicine, setMedicine] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/inventory/${id}/log/`, { params: { page, limit: 20 } })
      setMedicine(res.data.data.medicine)
      setLogs(res.data.data.logs || [])
      setTotal(res.data.data.pagination?.total || 0)
      setTotalPages(res.data.data.pagination?.totalPages || 1)
    } catch {}
    finally { setLoading(false) }
  }, [id, page])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/admin/inventory" className="hover:text-primary transition-colors">Inventory</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <Link href={`/admin/inventory/${id}`} className="hover:text-primary transition-colors">{medicine?.name || '...'}</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Stock Log</span>
      </div>

      {medicine && (
        <div className="bg-surface rounded-2xl border border-outline-variant p-4 flex items-center gap-4">
          {medicine.image_url ? (
            <img src={resolveImg(medicine.image_url) || undefined} alt={medicine.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '28px' }}>medication</span>
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-bold text-on-surface">{medicine.name}</p>
            <p className="text-xs text-on-surface-variant">{medicine.brand?.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-on-surface">{medicine.stock_quantity}</p>
            <p className="text-xs text-on-surface-variant">Current Stock</p>
          </div>
          <Link href={`/admin/inventory/${id}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span>
            Update Stock
          </Link>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant">
          <div>
            <h2 className="text-sm font-bold text-on-surface">Stock Change History</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">{total} entries total</p>
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-surface-container-low rounded-xl animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>history</span>
            <p className="text-base font-medium text-on-surface mt-3">No stock changes yet</p>
            <p className="text-sm text-on-surface-variant mt-1">Changes will appear here after you update stock</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {logs.map((log) => {
              const cfg = ACTION_CFG[log.action] || ACTION_CFG.SET
              const isPositive = log.action === 'ADD' || (log.action === 'SET' && log.quantity_after > log.quantity_before)
              return (
                <div key={log.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    <span className="material-symbols-outlined ms-filled" style={{ fontSize: '20px' }}>{cfg.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-sm font-semibold text-on-surface">
                        {log.quantity_before} → {log.quantity_after} units
                        <span className={`ml-1.5 text-xs ${isPositive ? 'text-primary' : 'text-error'}`}>
                          ({isPositive ? '+' : '-'}{log.quantity_change})
                        </span>
                      </span>
                    </div>
                    {log.note && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{log.note}</p>}
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      by {log.admin_name || 'System'} · {new Date(log.created_at).toLocaleString('en-NP', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-outline-variant flex items-center justify-between">
            <p className="text-sm text-on-surface-variant">{logs.length} of {total} entries</p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-outline-variant hover:bg-surface-container disabled:opacity-40 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
