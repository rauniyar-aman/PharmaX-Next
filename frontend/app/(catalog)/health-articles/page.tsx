'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { BlogPost } from '@/types'

function ArticleCardSkeleton() {
  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-outline-variant animate-pulse">
      <div className="h-36 bg-surface-container" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-surface-container rounded w-1/3" />
        <div className="h-4 bg-surface-container rounded w-3/4" />
      </div>
    </div>
  )
}

export default function HealthArticlesPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')

  useEffect(() => {
    api.get('/blog/categories/').then((r) => setCategories(r.data.data.categories || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params: Record<string, any> = { limit: 24 }
    if (category) params.category = category
    api.get('/blog/', { params }).then((r) => setPosts(r.data.data.posts || [])).catch(() => {}).finally(() => setLoading(false))
  }, [category])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Health Articles</h1>
        <p className="text-sm text-on-surface-variant mt-1">Reliable health information, curated by our team.</p>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${category === '' ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${category === c ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '48px' }}>article</span>
          <p className="text-base font-medium text-on-surface mt-3">No articles yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-4">
          {posts.map((p) => (
            <Link key={p.id} href={`/health-articles/${p.slug}`}
              className="bg-surface rounded-2xl overflow-hidden border border-outline-variant hover:-translate-y-1 hover:shadow-md transition-all duration-200 flex flex-col">
              {p.cover_image_url ? (
                <img src={resolveImg(p.cover_image_url) || undefined} alt={p.title} className="h-36 w-full object-cover" />
              ) : (
                <div className="h-36 w-full bg-surface-container-low flex items-center justify-center">
                  <span className="material-symbols-outlined text-on-surface-variant opacity-40" style={{ fontSize: '36px' }}>article</span>
                </div>
              )}
              <div className="p-4 flex flex-col flex-1">
                {p.category && <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">{p.category}</span>}
                <p className="text-sm font-semibold text-on-surface leading-snug mt-1 flex-1">{p.title}</p>
                {p.published_at && <p className="text-[11px] text-on-surface-variant mt-2">{new Date(p.published_at).toLocaleDateString()}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
