'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'
import type { BlogPost } from '@/types'

export default function HealthArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    api.get(`/blog/${slug}/`).then((r) => setPost(r.data.data.post)).catch(() => {}).finally(() => setLoading(false))
  }, [slug])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  if (!post) return (
    <div className="text-center py-24">
      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '56px' }}>article</span>
      <p className="text-base font-medium text-on-surface mt-3">Article not found</p>
      <Link href="/health-articles" className="inline-block mt-4 text-sm text-primary hover:underline">Back to Health Articles</Link>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/health-articles" className="hover:text-primary transition-colors">Health Articles</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium truncate">{post.title}</span>
      </div>

      {post.cover_image_url && (
        <img src={resolveImg(post.cover_image_url) || undefined} alt={post.title} className="w-full h-64 sm:h-80 object-cover rounded-2xl" />
      )}

      <div className="space-y-2">
        {post.category && <span className="text-xs font-semibold text-primary uppercase tracking-wide">{post.category}</span>}
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface leading-tight">{post.title}</h1>
        <p className="text-xs text-on-surface-variant">
          By {post.author}{post.published_at && ` · ${new Date(post.published_at).toLocaleDateString()}`}
        </p>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant p-6">
        <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">{post.content}</p>
      </div>
    </div>
  )
}
