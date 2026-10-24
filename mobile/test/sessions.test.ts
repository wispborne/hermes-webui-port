import { loadSessionPage, markerForStatus, type SessionRow } from '@/gateway/sessions-api'
import { $appActive } from '@/store/app-state'
import {
  $hasMoreSessions,
  $markers,
  $sessionRows,
  keepSessionsCurrent,
  loadMoreSessions,
  reloadMarkers,
  reloadSessions,
  searchForSessions,
  setLocalMarker,
  showSavedSessions
} from '@/store/sessions'

import { event } from './fake-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

const gatewayRow = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `s${n}`,
  title: `Session ${n}`,
  preview: `Preview ${n}`,
  started_at: 1_000 + n,
  last_active: 2_000 - n,
  message_count: 2,
  source: 'gui',
  ...extra
})

let h: Harness
/** The gateway's saved sessions, newest first. */
let gatewayRows: ReturnType<typeof gatewayRow>[]

beforeEach(async () => {
  h = await signedInHarness()
  gatewayRows = Array.from({ length: 50 }, (_, i) => gatewayRow(i + 1))
  h.rest.route('GET', /^\/api\/profiles\/sessions$/, (_, query) => {
    const limit = Number(query.get('limit'))
    const offset = Number(query.get('offset'))

    return { body: { sessions: gatewayRows.slice(offset, offset + limit), total: gatewayRows.length, limit, offset } }
  })
  $appActive.set(true)
})

afterEach(() => h.close())

const listCalls = () => h.rest.calls.filter(call => call.path === '/api/profiles/sessions')
const ids = (rows: SessionRow[]) => rows.map(row => row.id)

describe('the list loader', () => {
  it('asks for the default profile, recent first, without cron or archived sessions', async () => {
    let asked: URLSearchParams | null = null
    h.rest.route('GET', /^\/api\/profiles\/sessions$/, (_, query) => {
      asked = query

      return { body: { sessions: [], total: 0 } }
    })
    await loadSessionPage(h.context.rest)

    const query = Object.fromEntries((asked ?? new URLSearchParams()).entries())
    expect(query).toEqual(
      expect.objectContaining({
        limit: '40',
        offset: '0',
        profile: 'default',
        exclude_sources: 'cron',
        archived: 'exclude',
        order: 'recent'
      })
    )
  })

  it('drops hidden rows and says when there are more pages', async () => {
    gatewayRows[1] = gatewayRow(2, { hidden: true })

    const first = await loadSessionPage(h.context.rest)
    const last = await loadSessionPage(h.context.rest, 40)

    expect(first.rows).toHaveLength(39)
    expect(first.rows.find(row => row.id === 's2')).toBeUndefined()
    expect(first.hasMore).toBe(true)
    expect(ids(last.rows)).toEqual(['s41', 's42', 's43', 's44', 's45', 's46', 's47', 's48', 's49', 's50'])
    expect(last.hasMore).toBe(false)
  })
})

describe('the saved list', () => {
  it('saves what it loads and shows it again from saved data', async () => {
    await reloadSessions()
    expect($sessionRows.get()).toHaveLength(40)

    $sessionRows.set([])
    h.rest.reachable = false
    await showSavedSessions(h.context)

    expect(ids($sessionRows.get())).toEqual(gatewayRows.slice(0, 40).map(row => row.id))
  })

  it('removes sessions the gateway no longer returns', async () => {
    await reloadSessions()
    gatewayRows = gatewayRows.filter(row => row.id !== 's3')

    await reloadSessions()

    expect(ids($sessionRows.get())).not.toContain('s3')
    expect(h.db.all('SELECT id FROM sessions').map(row => row.id)).not.toContain('s3')
  })

  it('loads the next page below and saves it too', async () => {
    await reloadSessions()
    await loadMoreSessions()

    expect($sessionRows.get()).toHaveLength(50)
    expect($hasMoreSessions.get()).toBe(false)
    expect(h.db.all('SELECT COUNT(*) AS n FROM sessions')[0].n).toBe(50)
  })

  it('keeps the saved list when the gateway is unreachable', async () => {
    await reloadSessions()
    h.rest.reachable = false

    await reloadSessions()

    expect($sessionRows.get()).toHaveLength(40)
  })
})

describe('markers', () => {
  it.each([
    ['working', 'running'],
    ['streaming', 'running'],
    ['starting', 'running'],
    ['resuming', 'running'],
    ['waiting', 'needs-input'],
    ['idle', null],
    [undefined, null]
  ])('shows %s as %s', (status, marker) => {
    expect(markerForStatus(status)).toBe(marker)
  })

  it('reads every live session on the gateway', async () => {
    h.methods.set('session.active_list', () => ({
      sessions: [
        { session_key: 's1', status: 'streaming' },
        { session_key: 's2', status: 'waiting' },
        { session_key: 's3', status: 'idle' }
      ]
    }))

    await reloadMarkers()

    expect($markers.get()).toEqual({ s1: 'running', s2: 'needs-input' })
  })

  it("lets this phone's own sessions change their marker at once", async () => {
    h.methods.set('session.active_list', () => ({ sessions: [{ session_key: 's1', status: 'streaming' }] }))
    await reloadMarkers()

    setLocalMarker('s1', null)
    setLocalMarker('s2', 'needs-input')

    expect($markers.get()).toEqual({ s2: 'needs-input' })
  })
})

describe('staying current', () => {
  it('reloads once for a burst of sessions.changed events', async () => {
    const stop = keepSessionsCurrent(h.context, { debounceMs: 200, pollMs: 60_000 })
    const before = listCalls().length

    h.gateway.send(event('sessions.changed'))
    h.gateway.send(event('sessions.changed'))
    h.gateway.send(event('sessions.changed'))
    await until(() => listCalls().length > before)
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(listCalls().length - before).toBe(1)
    stop()
  })

  it('polls markers while on screen and stops in the background', async () => {
    let asked = 0
    h.methods.set('session.active_list', () => {
      asked++

      return { sessions: [] }
    })
    const stop = keepSessionsCurrent(h.context, { debounceMs: 200, pollMs: 30 })

    await until(() => asked >= 2)
    $appActive.set(false)
    await new Promise(resolve => setTimeout(resolve, 40))
    const inBackground = asked
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(asked).toBe(inBackground)

    $appActive.set(true)
    await until(() => asked > inBackground)
    stop()
  })

  it('clears markers when the connection drops', async () => {
    h.methods.set('session.active_list', () => ({ sessions: [{ session_key: 's1', status: 'working' }] }))
    const stop = keepSessionsCurrent(h.context, { debounceMs: 200, pollMs: 60_000 })
    await reloadMarkers()
    expect($markers.get()).toEqual({ s1: 'running' })

    h.rest.reachable = false
    h.gateway.dropClients()
    await until(() => h.context.connection.$status.get() === 'offline')

    expect($markers.get()).toEqual({})
    stop()
  })
})

describe('search', () => {
  it('searches the gateway while connected', async () => {
    h.rest.route('GET', /^\/api\/sessions\/search$/, (_, query) => ({
      body: {
        results: [
          { session_id: 's7', title: 'Docker cache', snippet: `…${query.get('q')} build…`, last_active: 10, source: 'gui' },
          { session_id: 's7', title: 'Docker cache', snippet: 'second hit, same session', last_active: 10, source: 'gui' },
          { session_id: 'cron1', title: 'Nightly', snippet: 'docker', source: 'cron' }
        ]
      }
    }))

    const found = await searchForSessions('docker')

    expect(found.savedOnly).toBe(false)
    expect(found.rows).toEqual([expect.objectContaining({ id: 's7', title: 'Docker cache', preview: '…docker build…' })])
  })

  it('searches saved titles and previews while offline, and says so', async () => {
    gatewayRows[4] = gatewayRow(5, { title: 'Fix the Docker build' })
    gatewayRows[9] = gatewayRow(10, { preview: 'my docker compose file' })
    await reloadSessions()
    h.rest.reachable = false
    h.gateway.dropClients()
    await until(() => h.context.connection.$status.get() === 'offline')

    const found = await searchForSessions('DOCKER')

    expect(found.savedOnly).toBe(true)
    expect(ids(found.rows)).toEqual(['s5', 's10'])
  })
})
