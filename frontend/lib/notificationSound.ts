let audioCtx: AudioContext | null = null

/** Phone-ring-style chime (three quick pulses, not one polite beep), synthesized via Web Audio
 * API — no audio file to bundle. Deliberately more insistent than a single chime: this is meant
 * to pull the pharmacy's attention away from whatever they're doing, not politely announce itself.
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

    // three quick two-tone pulses in a row (~1.1s total) instead of one — reads as an urgent
    // "ring ring ring" rather than a single easy-to-miss ping.
    for (let pulse = 0; pulse < 3; pulse++) {
      const base = pulse * 0.38
      playTone(880, base, 0.18)
      playTone(1320, base + 0.12, 0.24)
    }
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
 * retry gives a subsequent click elsewhere on the page a chance to unlock it). Short interval is
 * deliberate — this should feel like a phone ringing, not an occasional reminder ping. */
export function startRepeatingChime(intervalMs = 2500) {
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
