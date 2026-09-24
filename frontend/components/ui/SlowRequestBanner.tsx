'use client'

import { useEffect, useState } from 'react'
import { oldestPendingStart, subscribeToRequests } from '@/lib/requestActivity'

/**
 * How long a request may run before we say something. Normal calls finish well under a second;
 * this threshold is set past any healthy request but early enough to reassure someone staring at
 * a skeleton that hasn't moved.
 */
const SLOW_AFTER_MS = 8000

/**
 * One global explanation for an unusually long wait.
 *
 * Pages already render their own skeletons, which answer "is something happening?". This answers
 * the question a stalled skeleton raises instead — "is this broken?" — for the free-tier backend's
 * cold start. It never blocks input: it sits above the page and ignores pointer events.
 */
export default function SlowRequestBanner() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const check = () => {
      const oldest = oldestPendingStart()
      setSlow(oldest !== 0 && Date.now() - oldest >= SLOW_AFTER_MS)
    }

    // Only poll while something is actually in flight, so an idle tab stays idle.
    const sync = () => {
      check()
      const busy = oldestPendingStart() !== 0
      if (busy && !timer) timer = setInterval(check, 1000)
      if (!busy && timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const unsubscribe = subscribeToRequests(sync)
    sync()

    return () => {
      unsubscribe()
      if (timer) clearInterval(timer)
    }
  }, [])

  if (!slow) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6"
    >
      <div className="flex max-w-md items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-4 py-3 shadow-lg">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
        <p className="text-sm text-on-surface-variant">
          <span className="font-semibold text-on-surface">This is taking longer than usual.</span>{' '}
          The server may be waking up — it can take up to a minute.
        </p>
      </div>
    </div>
  )
}
