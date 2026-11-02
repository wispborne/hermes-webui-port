import { loadSessionPage, markerForStatus, type SessionRow } from '@/gateway/sessions-api'
import { $appActive } from '@/store/app-state'
import {
  $hasMoreSessions,
  $markers,
  $sessionRows,
  archiveSession,
  deleteSession,
  keepSessionsCurrent,
  loadMoreSessions,
  orderSessions,
  reloadMarkers,
  reloadSessions,
  renameSession,
  searchForSessions,
  setLocalMarker,
  setSessionPinned,
  showSavedSessions,
  unarchiveSession
} from '@/store/sessions'
import { loadSavedRows } from '@/storage/session-rows'
import { loadTranscript, saveTranscript } from '@/storage/transcripts'

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

    const archived = query.get('archived') === 'only'
    const rows = gatewayRows.filter(row => Boolean((row as { archived?: boolean }).archived) === archived)

    return { body: { sessions: rows.slice(offset, offset + limit), total: rows.length, limit, offset } }
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

describe('renaming, pinning and deleting', () => {
  let revision: number
  let edits: { method: string; id: string; body: unknown; query: Record<string, string> }[]

  beforeEach(async () => {
    revision = 3
    edits = []
    h.rest.route('GET', /^\/api\/sessions\/[^/]+\/mutation-snapshot$/, call => ({
      body: { session_id: call.path.split('/')[3], exists: true, runtime_revision: revision, runtime_generation: 0 }
    }))
    const edit = (call: { method: string; path: string; body: unknown }, query: URLSearchParams) => {
      const id = call.path.split('/')[3]
      edits.push({ method: call.method, id, body: call.body, query: Object.fromEntries(query) })
      const index = gatewayRows.findIndex(row => row.id === id)

      if (call.method === 'DELETE') {
        gatewayRows.splice(index, 1)
      } else {
        Object.assign(gatewayRows[index], call.body as object)
      }

      revision += 1

      return { body: { ok: true } }
    }
    h.rest.route('PATCH', /^\/api\/sessions\/[^/]+$/, edit)
    h.rest.route('DELETE', /^\/api\/sessions\/[^/]+$/, edit)
    await reloadSessions()
  })

  it('renames a session with the revision its snapshot gave', async () => {
    await renameSession('s2', '  Garden beds  ')

    expect(edits).toEqual([
      { method: 'PATCH', id: 's2', body: { title: 'Garden beds', request_id: expect.any(String), expected_revision: 3, expected_generation: 0 }, query: {} }
    ])
    expect($sessionRows.get().find(row => row.id === 's2')?.title).toBe('Garden beds')
  })

  it('pins a session, and the list and the saved list show it pinned', async () => {
    await setSessionPinned('s7', true)

    expect(edits[0]).toMatchObject({ method: 'PATCH', id: 's7', body: { pinned: true, expected_revision: 3 } })
    expect($sessionRows.get().find(row => row.id === 's7')?.pinned).toBe(true)
    expect((await loadSavedRows(h.db)).find(row => row.id === 's7')?.pinned).toBe(true)
  })

  it('deletes a session, with its revision in the query, and forgets what the phone saved of it', async () => {
    await saveTranscript(h.db, 's3', { items: [{ kind: 'user', key: 'u', text: 'Hi' }], hasEarlier: false, gatewayRows: 1 })

    await deleteSession('s3')

    expect(edits).toEqual([
      { method: 'DELETE', id: 's3', body: undefined, query: { request_id: expect.any(String), expected_revision: '3', expected_generation: '0' } }
    ])
    expect(ids($sessionRows.get())).not.toContain('s3')
    expect(await loadTranscript(h.db, 's3')).toBeNull()
    expect(ids(await loadSavedRows(h.db))).not.toContain('s3')
  })

  it('archives a session, unpinning it as the desktop does, and takes it out of the list', async () => {
    await archiveSession('s4')

    expect(edits[0]).toMatchObject({ method: 'PATCH', id: 's4', body: { archived: true, pinned: false, expected_revision: 3 } })
    expect(ids($sessionRows.get())).not.toContain('s4')
  })

  it('unarchives a session', async () => {
    await unarchiveSession('s4')

    expect(edits[0]).toMatchObject({ method: 'PATCH', id: 's4', body: { archived: false } })
    expect((edits[0].body as Record<string, unknown>).pinned).toBeUndefined()
  })

  it('edits without a revision on a gateway that has no snapshot route', async () => {
    h.rest.route('GET', /^\/api\/sessions\/[^/]+\/mutation-snapshot$/, () => ({ status: 404, body: { detail: 'Not Found' } }))

    await renameSession('s2', 'Garden beds')

    expect(edits).toEqual([{ method: 'PATCH', id: 's2', body: { title: 'Garden beds' }, query: {} }])
  })

  it('keeps the row as it was when the gateway refuses the edit', async () => {
    h.rest.route('PATCH', /^\/api\/sessions\/[^/]+$/, () => ({ status: 409, body: { detail: 'revision_conflict' } }))

    await expect(renameSession('s2', 'Garden beds')).rejects.toThrow('revision_conflict')
    expect($sessionRows.get().find(row => row.id === 's2')?.title).toBe('Session 2')
  })
})

describe('the list order', () => {
  it('puts sessions that need input first, then pinned ones, and keeps the rest in order', () => {
    const rows = [1, 2, 3, 4, 5].map(n => ({ ...gatewayRowAsSession(n), pinned: n === 4 }))

    expect(ids(orderSessions(rows, { s5: 'needs-input', s2: 'running' }))).toEqual(['s5', 's4', 's1', 's2', 's3'])
  })
})

function gatewayRowAsSession(n: number): SessionRow {
  return { id: `s${n}`, title: `Session ${n}`, preview: null, startedAt: n, lastActive: n, messageCount: 1, source: 'gui', pinned: false }
}
