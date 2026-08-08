let audioCtx: AudioContext | null = null

/** Two-tone chime, synthesized via Web Audio API — no audio file to bundle.
 * Returns whether it actually had a running (audible) AudioContext to play through — browsers
 * that require a prior user gesture leave a freshly-created context 'suspended' and .resume()
 * called outside a gesture handler silently never resolves, so a caller that cares whether the
 * sound really played (e.g. the repeating alert, which should keep retrying until it works)
 * needs this signal instead of assuming success. */
export function playNotificationChime(): boolean {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      audioCtx = new Ctor()
    }
    const ctx = audioCtx
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.3, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + duration)
    }

    playTone(880, 0, 0.18)
    playTone(1320, 0.12, 0.24)
    return ctx.state === 'running'
  } catch {
    // Web Audio unsupported/blocked (e.g. no user gesture yet) — the visual toast/modal still fires.
    return false
  }
}

let repeatTimer: ReturnType<typeof setInterval> | null = null

/** Keeps re-playing the chime every `intervalMs` until stopRepeatingChime() is called — used to
 * satisfy "play sound until the pharmacy reviews the request", since a single chime can be
 * missed (pharmacy stepped away) or silently fail (no user gesture has unlocked audio yet; each
 * retry gives a subsequent click elsewhere on the page a chance to unlock it). */
export function startRepeatingChime(intervalMs = 8000) {
  if (repeatTimer) return
  playNotificationChime()
  repeatTimer = setInterval(() => playNotificationChime(), intervalMs)
}

export function stopRepeatingChime() {
  if (repeatTimer) {
    clearInterval(repeatTimer)
    repeatTimer = null
  }
}
