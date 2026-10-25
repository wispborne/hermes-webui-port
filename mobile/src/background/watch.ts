// Alerts for sessions the phone hasn't opened, such as a turn started on the
// laptop that stops on an Approval. Plain logic with its timers and gateway
// calls passed in, so the rules can be tested with a fake clock. See the
// other-session-alerts design and docs/adr/0003.
//
// - It runs while Keep connected is on, the person is signed in and the
//   connection is open, whether or not the app is on screen.
// - Every 10 seconds it asks the gateway which Live sessions are waiting.
// - A session the phone isn't attached to that has waited for 30 seconds gets
//   one alert. A session that stops waiting is forgotten, and its alert is
//   taken back.

import type { SessionMarker } from '@/gateway/sessions-api'

export const WATCH_POLL_MS = 10_000
export const ALERT_AFTER_MS = 30_000

export interface WatchDeps {
  /** Markers for every Live session, by stored id. */
  loadMarkers(): Promise<Record<string, SessionMarker>>
  /** The phone is attached to this session, so it hears its requests already. */
  isAttached(storedId: string): boolean
  /** The session has waited long enough: alert the person. */
  alert(storedId: string): void
  /** The session stopped waiting: take back any alert. */
  forget(storedId: string): void
  now(): number
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(timer: unknown): void
}

interface Waiting {
  since: number
  alerted: boolean
}

export class Watch {
  private timer: unknown = null
  private checking = false
  private readonly waiting = new Map<string, Waiting>()

  constructor(private readonly deps: WatchDeps) {}

  get isOn() {
    return this.timer !== null
  }

  /** Starts or stops watching. Starting checks at once. */
  setOn(on: boolean) {
    if (on && this.timer === null) {
      this.schedule(0)
    } else if (!on && this.timer !== null) {
      this.deps.clearTimer(this.timer)
      this.timer = null
      this.forgetAll()
    }
  }

  /** One check. Exposed for tests and for checking straight after a reconnect. */
  async check() {
    if (this.checking) {
      return
    }

    this.checking = true

    try {
      const markers = await this.deps.loadMarkers()
      const now = this.deps.now()

      for (const storedId of [...this.waiting.keys()]) {
        if (markers[storedId] !== 'needs-input' || this.deps.isAttached(storedId)) {
          this.forget(storedId)
        }
      }

      for (const [storedId, marker] of Object.entries(markers)) {
        if (marker !== 'needs-input' || this.deps.isAttached(storedId)) {
          continue
        }

        const entry = this.waiting.get(storedId) ?? { since: now, alerted: false }
        this.waiting.set(storedId, entry)

        if (!entry.alerted && now - entry.since >= ALERT_AFTER_MS) {
          entry.alerted = true
          this.deps.alert(storedId)
        }
      }
    } catch {
      // Offline or slow: the next check tries again.
    } finally {
      this.checking = false
    }
  }

  private schedule(ms: number) {
    this.timer = this.deps.setTimer(async () => {
      await this.check()

      if (this.timer !== null) {
        this.schedule(WATCH_POLL_MS)
      }
    }, ms)
  }

  private forget(storedId: string) {
    const entry = this.waiting.get(storedId)
    this.waiting.delete(storedId)

    if (entry?.alerted) {
      this.deps.forget(storedId)
    }
  }

  private forgetAll() {
    for (const storedId of [...this.waiting.keys()]) {
      this.forget(storedId)
    }
  }
}
