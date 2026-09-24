/**
 * Loading skeletons.
 *
 * The app already had this shape inlined in ~70 pages as
 * `bg-surface-container-low rounded animate-pulse`; these primitives are that same idiom, named,
 * so route-level `loading.tsx` files don't each re-hand-roll it.
 *
 * A skeleton is a promise about what is arriving — keep the block counts and proportions close to
 * the real content, or the swap-in reads as a layout jump.
 */

const PULSE = 'animate-pulse motion-reduce:animate-none'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-surface-container-low rounded ${PULSE} ${className}`} />
}

/** A stack of text bars, last one short so it reads as the end of a paragraph. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/** Card outlines that match the real cards' border/radius so only the contents look unresolved. */
export function SkeletonCards({ count = 6, height = 'h-28', className = '' }: {
  count?: number; height?: string; className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`bg-surface rounded-2xl border border-outline-variant p-5 ${height} ${PULSE}`} />
      ))}
    </div>
  )
}

type Shape = 'cards' | 'grid' | 'table' | 'detail' | 'form'

/**
 * The whole-route fallback. `shape` picks the silhouette of the section being navigated to, so the
 * placeholder resembles the page that replaces it rather than a generic spinner.
 */
export default function PageSkeleton({ shape = 'cards', title = true }: { shape?: Shape; title?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className="w-full">
      <span className="sr-only">Loading…</span>

      {title && (
        <div className="mb-6 space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-72" />
        </div>
      )}

      {shape === 'cards' && <SkeletonCards count={5} height="h-24" className="space-y-3" />}

      {shape === 'grid' && (
        <SkeletonCards count={8} height="h-56" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" />
      )}

      {shape === 'table' && (
        <>
          <SkeletonCards count={4} height="h-24" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" />
          <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-3">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
          </div>
        </>
      )}

      {shape === 'detail' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant p-6 space-y-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <SkeletonText lines={4} />
          </div>
          <div className="bg-surface rounded-2xl border border-outline-variant p-6 space-y-4 h-fit">
            <Skeleton className="h-5 w-32" />
            <SkeletonText lines={3} />
            <Skeleton className="h-11 w-full rounded-2xl" />
          </div>
        </div>
      )}

      {shape === 'form' && (
        <div className="max-w-md mx-auto bg-surface rounded-2xl border border-outline-variant p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      )}
    </div>
  )
}
