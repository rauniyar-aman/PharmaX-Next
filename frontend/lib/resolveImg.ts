const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001'

/** Avatar/media URLs from the API are backend-relative (e.g. /media/avatars/x.png) — point them at the Django origin, not the Next.js one. */
export function resolveImg(url?: string | null): string | null {
  if (!url) return null
  if (url.startsWith('data:') || url.startsWith('http')) return url
  return `${BACKEND}${url}`
}
