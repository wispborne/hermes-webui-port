// A pretend gateway brain for the chat tests, on top of the harness: saved
// sessions with transcripts, Live sessions with runtime ids, an event log per
// Live session for replay, and the session and prompt methods.

import { event, type Frame, rpcError } from './fake-gateway'
import type { Harness } from './harness'

export interface Row {
  role: 'user' | 'assistant' | 'tool'
  content: string
  row_id: number
  timestamp: number
}

interface Live {
  runtimeId: string
  storedId: string
  seq: number
  log: Frame[]
  running: boolean
  inflight: { user?: string; assistant?: string } | null
}

export class ChatGateway {
  readonly rows = new Map<string, Row[]>()
  readonly live = new Map<string, Live>()
  readonly submitted: { storedId: string; text: string }[] = []
  /** Matches the handshake recording, so the first reconnect isn't taken for a restart. */
  epoch = 'test-epoch'
  private restarts = 0
  /** What `prompt.submit` does. By default it accepts and starts a turn. */
  onSubmit: (live: Live, text: string, frame: Frame) => unknown = () => ({ status: 'streaming' })
  private nextRow = 1
  private nextRuntime = 1
  private nextStored = 1

  constructor(private readonly h: Harness) {
    h.gateway.options.replayEpoch = () => this.epoch

    h.rest.route('GET', /^\/api\/sessions\/[^/]+\/messages$/, (call, query) => {
      const storedId = decodeURIComponent(call.path.split('/')[3])
      const rows = this.rows.get(storedId) ?? []
      const limit = Number(query.get('limit') ?? rows.length)
      const offset = Number(query.get('offset') ?? 0)
      const end = rows.length - offset

      return {
        body: {
          session_id: storedId,
          messages: rows.slice(Math.max(0, end - limit), Math.max(0, end)),
          pagination: { limit, offset, order: 'latest', returned: 0 }
        }
      }
    })

    h.methods.set('session.resume', frame => {
      const storedId = (frame.params as { session_id: string }).session_id

      if (!this.rows.has(storedId)) {
        h.gateway.send(rpcError(frame, 4004, 'session not found', { reason: 'not_found' }))

        return undefined
      }

      const live = this.liveFor(storedId)

      return { session_id: live.runtimeId, stored_session_id: storedId, running: live.running, inflight: live.inflight, messages: [], open_requests: [] }
    })

    h.methods.set('session.create', () => {
      const storedId = `new-${this.nextStored++}`
      this.rows.set(storedId, [])
      const live = this.liveFor(storedId)

      return { session_id: live.runtimeId, stored_session_id: storedId, messages: [], message_count: 0, info: {} }
    })

    h.methods.set('prompt.submit', frame => {
      const { session_id: runtimeId, text } = frame.params as { session_id: string; text: string }
      const live = this.live.get(runtimeId)

      if (!live) {
        h.gateway.send(rpcError(frame, 4004, 'session not found', { reason: 'not_found' }))

        return undefined
      }

      this.submitted.push({ storedId: live.storedId, text })
      this.addRow(live.storedId, 'user', text)

      return this.onSubmit(live, text, frame)
    })

    h.methods.set('session.interrupt', frame => {
      const live = this.live.get((frame.params as { session_id: string }).session_id)

      if (live?.running) {
        this.emit(live.storedId, 'message.complete', { text: '', status: 'interrupted' })
      }

      return { status: live?.running ? 'interrupted' : 'not_interrupted' }
    })

    h.methods.set('session.events.since', frame => {
      const { session_id: runtimeId, last_seen: lastSeen } = frame.params as { session_id: string; last_seen: number }
      const live = this.live.get(runtimeId)

      if (!live) {
        h.gateway.send(rpcError(frame, 4004, 'session not found', { reason: 'not_found' }))

        return undefined
      }

      const events = live.log.map(f => f.params as { seq: number }).filter(e => e.seq > lastSeen)

      return { events, latest_seq: live.seq, truncated: false, count: events.length, epoch: this.epoch, open_requests: [] }
    })
  }

  addSession(storedId: string, rows: [Row['role'], string][] = []) {
    this.rows.set(storedId, [])

    for (const [role, content] of rows) {
      this.addRow(storedId, role, content)
    }
  }

  addRow(storedId: string, role: Row['role'], content: string) {
    this.rows.get(storedId)?.push({ role, content, row_id: this.nextRow++, timestamp: Date.now() / 1000 })
  }

  liveFor(storedId: string): Live {
    for (const live of this.live.values()) {
      if (live.storedId === storedId) {
        return live
      }
    }

    const live: Live = { runtimeId: `rt-${this.nextRuntime++}`, storedId, seq: 0, log: [], running: false, inflight: null }
    this.live.set(live.runtimeId, live)

    return live
  }

  /** Sends a session event to the clients and keeps it for replay. Pass `send: false` to only log it, as if no client was attached. */
  emit(storedId: string, type: string, payload: Record<string, unknown> = {}, send = true) {
    const live = this.liveFor(storedId)
    const frame = event(type, payload, live.runtimeId, ++live.seq)
    live.log.push(frame)

    if (type === 'message.start') {
      live.running = true
      live.inflight = { assistant: '' }
    } else if (type === 'message.delta' && live.inflight) {
      live.inflight.assistant += String(payload.text ?? '')
    } else if (type === 'message.complete') {
      live.running = false
      live.inflight = null
      this.addRow(storedId, 'assistant', String(payload.text ?? ''))
    }

    if (send) {
      this.h.gateway.send(frame)
    }
  }

  /** A whole reply, sent at once. */
  reply(storedId: string, text: string) {
    this.emit(storedId, 'message.start')
    this.emit(storedId, 'message.delta', { text })
    this.emit(storedId, 'message.complete', { text, status: 'complete' })
  }

  /** The gateway restarted: a new epoch, and every Live session is gone. */
  restart() {
    this.epoch = `restarted-${++this.restarts}`
    this.live.clear()
  }
}
