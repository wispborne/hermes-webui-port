import type { SessionMarker } from '@/gateway/sessions-api'

import { ALERT_AFTER_MS, Watch, WATCH_POLL_MS } from './watch'

function setup() {
  jest.useFakeTimers()
  const calls: string[] = []
  let markers: Record<string, SessionMarker> = {}
  const attached = new Set<string>()
  let checks = 0

  const watch = new Watch({
    loadMarkers: async () => {
      checks++

      return markers
    },
    isAttached: storedId => attached.has(storedId),
    alert: storedId => calls.push(`alert ${storedId}`),
    forget: storedId => calls.push(`forget ${storedId}`),
    now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
  })

  return {
    attached,
    calls,
    checks: () => checks,
    setMarkers: (next: Record<string, SessionMarker>) => {
      markers = next
    },
    watch
  }
}

/** Moves the fake clock on and lets each check's promise settle. */
async function wait(ms: number) {
  await jest.advanceTimersByTimeAsync(ms)
}

afterEach(() => jest.useRealTimers())

describe('Watch', () => {
  it('checks at once and then every 10 seconds while on', async () => {
    const { checks, watch } = setup()

    watch.setOn(true)
    await wait(0)
    expect(checks()).toBe(1)

    await wait(WATCH_POLL_MS * 3)
    expect(checks()).toBe(4)

    watch.setOn(false)
    await wait(WATCH_POLL_MS * 3)
    expect(checks()).toBe(4)
  })

  it('alerts once a session has waited 30 seconds, and not before', async () => {
    const { calls, setMarkers, watch } = setup()
    setMarkers({ laptop: 'needs-input' })

    watch.setOn(true)
    await wait(ALERT_AFTER_MS - WATCH_POLL_MS)
    expect(calls).toEqual([])

    await wait(WATCH_POLL_MS)
    expect(calls).toEqual(['alert laptop'])
  })

  it('alerts once per wait', async () => {
    const { calls, setMarkers, watch } = setup()
    setMarkers({ laptop: 'needs-input' })

    watch.setOn(true)
    await wait(ALERT_AFTER_MS * 4)

    expect(calls).toEqual(['alert laptop'])
  })

  it("doesn't alert when the request is answered within 30 seconds", async () => {
    const { calls, setMarkers, watch } = setup()
    setMarkers({ laptop: 'needs-input' })

    watch.setOn(true)
    await wait(20_000)
    setMarkers({ laptop: 'running' })
    await wait(ALERT_AFTER_MS * 2)

    expect(calls).toEqual([])
  })

  it('takes the alert back when the session stops waiting, and alerts again for the next wait', async () => {
    const { calls, setMarkers, watch } = setup()
    setMarkers({ laptop: 'needs-input' })

    watch.setOn(true)
    await wait(ALERT_AFTER_MS)
    setMarkers({})
    await wait(WATCH_POLL_MS)
    expect(calls).toEqual(['alert laptop', 'forget laptop'])

    setMarkers({ laptop: 'needs-input' })
    await wait(ALERT_AFTER_MS + WATCH_POLL_MS)
    expect(calls).toEqual(['alert laptop', 'forget laptop', 'alert laptop'])
  })

  it('skips sessions the phone is attached to', async () => {
    const { attached, calls, setMarkers, watch } = setup()
    attached.add('phone')
    setMarkers({ phone: 'needs-input', laptop: 'needs-input' })

    watch.setOn(true)
    await wait(ALERT_AFTER_MS * 2)

    expect(calls).toEqual(['alert laptop'])
  })

  it('takes back its alerts when it stops', async () => {
    const { calls, setMarkers, watch } = setup()
    setMarkers({ laptop: 'needs-input' })

    watch.setOn(true)
    await wait(ALERT_AFTER_MS)
    watch.setOn(false)

    expect(calls).toEqual(['alert laptop', 'forget laptop'])
  })

  it('keeps going after a failed check', async () => {
    const { calls, setMarkers, watch } = setup()
    let fail = true
    setMarkers({ laptop: 'needs-input' })
    const load = (watch as unknown as { deps: { loadMarkers: () => Promise<Record<string, SessionMarker>> } }).deps
    const real = load.loadMarkers
    load.loadMarkers = () => (fail ? Promise.reject(new Error('offline')) : real())

    watch.setOn(true)
    await wait(WATCH_POLL_MS)
    fail = false
    await wait(ALERT_AFTER_MS + WATCH_POLL_MS)

    expect(calls).toEqual(['alert laptop'])
  })
})
