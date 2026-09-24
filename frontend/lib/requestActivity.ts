/**
 * In-flight API request tracking, so the UI can tell the difference between "loading" and
 * "loading for an alarming length of time".
 *
 * The backend runs on a free tier that spins down when idle (see the retry comment in `lib/api.ts`),
 * so the first request after a quiet spell can take the better part of a minute. Every page already
 * shows its own skeleton, but a skeleton that sits unchanged for 40 seconds reads as broken rather
 * than slow. This lets one global banner explain the wait.
 *
 * Start times are tracked per request rather than as a single counter: with a shared counter, a
 * long request that overlaps a short one would inherit the older start time and trip the banner
 * early.
 */

type Listener = () => void

const listeners = new Set<Listener>()
const pending = new Map<number, number>()
let nextId = 1

function emit() {
  for (const listener of listeners) listener()
}

/** Call when a request leaves; pass the returned id to {@link requestFinished}. */
export function requestStarted(): number {
  const id = nextId++
  pending.set(id, Date.now())
  emit()
  return id
}

export function requestFinished(id: number | undefined) {
  if (id !== undefined && pending.delete(id)) emit()
}

export function subscribeToRequests(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Epoch ms of the longest-waiting request still in flight, or 0 when everything has settled. */
export function oldestPendingStart(): number {
  let oldest = 0
  for (const startedAt of pending.values()) {
    if (oldest === 0 || startedAt < oldest) oldest = startedAt
  }
  return oldest
}
