'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { BlogPost } from '@/types'

function ArticleSkeleton() {
  return (
    <div className="w-60 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant overflow-hidden animate-pulse">
      <div className="h-28 bg-surface-container" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-surface-container rounded w-1/3" />
        <div className="h-4 bg-surface-container rounded w-3/4" />
      </div>
    </div>
  )
}

export default function HealthArticlesRail() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/blog/', { params: { limit: 8 } }).then((r) => setPosts(r.data.data.posts || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (!loading && posts.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface">Health Articles</h2>
        <Link href="/health-articles" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
          View All
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <ArticleSkeleton key={i} />)
          : posts.map((p) => (
            <Link key={p.id} href={`/health-articles/${p.slug}`}
              className="w-60 flex-shrink-0 bg-surface rounded-2xl border border-outline-variant overflow-hidden hover:-translate-y-1 hover:shadow-md transition-all duration-200">
              {p.cover_image_url ? (
                <img src={resolveImg(p.cover_image_url) || undefined} alt={p.title} className="h-28 w-full object-cover" />
              ) : (
                <div className="h-28 w-full bg-surface-container-low flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '28px' }}>article</span>
                </div>
              )}
              <div className="p-3">
                {p.category && <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">{p.category}</span>}
                <p className="text-sm font-semibold text-on-surface leading-snug mt-0.5 line-clamp-2">{p.title}</p>
              </div>
            </Link>
          ))
        }
      </div>
    </section>
  )
}
