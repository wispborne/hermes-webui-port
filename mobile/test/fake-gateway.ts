// A gateway for tests: a WebSocket server in the test process that plays back
// a recording from test/fixtures/ and keeps every frame the client sends.
//
// Server frames are sent in order until the recording expects a client frame.
// Playback then waits for the client to send a frame with the same method (or,
// for an answer to a server request, the same id). The ids of the client's
// requests differ from the recorded ones, so server answers are rewritten to
// use the client's ids. A `gateway.ping` that isn't in the recording is
// answered the way the gateway answers it.
//
// Tests can also script the gateway: `handle` answers client frames the
// recording doesn't cover, `send` pushes a frame to every client, and
// `dropClients` cuts every connection as a network drop would.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

import { type WebSocket, WebSocketServer } from 'ws'

export type Frame = Record<string, unknown> & { id?: string | number; method?: string }

export interface RecordedFrame {
  from: 'client' | 'server'
  frame: Frame
}

export interface Recording {
  /** What was recorded, and against which Hermes version. */
  description?: string
  hermesVersion?: string
  frames: RecordedFrame[]
}

export function loadRecording(name: string): Recording {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8')) as Recording
}

/** Answers one client frame the recording doesn't cover. */
export type FrameHandler = (frame: Frame, reply: (frame: Frame) => void) => void

export interface FakeGatewayOptions {
  /** False closes the socket with 4401, as the gateway does for a bad ticket. */
  acceptTicket?: (ticket: string | null) => boolean
  handle?: FrameHandler
  /** The `replay_epoch` to put in each new connection's `gateway.ready`. */
  replayEpoch?: () => string
}

/** A JSON-RPC result for request `frame`. */
export const result = (frame: Frame, value: unknown): Frame => ({ jsonrpc: '2.0', id: frame.id, result: value })

/** A JSON-RPC error for request `frame`. */
export const rpcError = (frame: Frame, code: number, message: string, data?: unknown): Frame => ({
  jsonrpc: '2.0',
  id: frame.id,
  error: { code, message, ...(data === undefined ? {} : { data }) }
})

/** A gateway event frame. */
export const event = (type: string, payload: unknown = {}, sessionId?: string, seq?: number): Frame => ({
  jsonrpc: '2.0',
  method: 'event',
  params: { type, payload, ...(sessionId ? { session_id: sessionId } : {}), ...(seq === undefined ? {} : { seq }) }
})

const matches = (recorded: Frame, live: Frame) =>
  recorded.method !== undefined ? recorded.method === live.method : live.method === undefined && recorded.id === live.id

export class FakeGateway {
  /** Every frame clients sent, in order. */
  readonly received: Frame[] = []
  /** The ticket each connection used, in order. */
  readonly tickets: (string | null)[] = []
  private readonly waiters = new Set<() => void>()
  options: FakeGatewayOptions

  private constructor(
    private readonly server: WebSocketServer,
    private readonly recording: Recording,
    options: FakeGatewayOptions
  ) {
    this.options = options
    server.on('connection', (socket, request) => {
      const ticket = new URL(request.url ?? '/', 'http://fake').searchParams.get('ticket')
      this.tickets.push(ticket)

      if (this.options.acceptTicket && !this.options.acceptTicket(ticket)) {
        socket.close(4401, 'bad ticket')

        return
      }

      this.play(socket)
    })
  }

  static async start(recording: Recording, options: FakeGatewayOptions = {}): Promise<FakeGateway> {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => server.once('listening', resolve))

    return new FakeGateway(server, recording, options)
  }

  get url(): string {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/ws`
  }

  /** The gateway's http address, which the app turns into the WebSocket URL. */
  get httpUrl(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  get clientCount(): number {
    return this.server.clients.size
  }

  /** Sends a frame to every connected client. */
  send(frame: Frame) {
    for (const client of this.server.clients) {
      client.send(JSON.stringify(frame))
    }
  }

  /** Cuts every connection without a close handshake, like a network drop. */
  dropClients() {
    for (const client of this.server.clients) {
      client.terminate()
    }
  }

  /** Waits until `test` passes, checking each time a client frame arrives and every 20 ms. */
  async waitFor(test: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs

    while (!test()) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for the fake gateway.')
      }

      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }

  /** Resolves with the first frame the client sent that passes `test`, waiting for it if needed. */
  async clientFrame(test: (frame: Frame) => boolean, timeoutMs = 2000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const found = this.received.find(test)

      if (found) {
        return found
      }

      if (Date.now() > deadline) {
        throw new Error(`The client sent no matching frame. It sent: ${JSON.stringify(this.received)}`)
      }

      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, deadline - Date.now())
        this.waiters.add(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
  }

  async close(): Promise<void> {
    for (const client of this.server.clients) {
      client.terminate()
    }

    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }

  private play(socket: WebSocket) {
    const frames = this.recording.frames
    const ids = new Map<string | number, string | number>()
    let next = 0

    const send = (frame: Frame) => socket.send(JSON.stringify(frame))

    const sendServerFrames = () => {
      while (next < frames.length && frames[next].from === 'server') {
        const frame = { ...frames[next].frame }

        if (frame.id !== undefined && frame.method === undefined && ids.has(frame.id)) {
          frame.id = ids.get(frame.id)
        }

        const params = frame.params as { type?: string; payload?: Record<string, unknown> } | undefined

        if (params?.type === 'gateway.ready' && this.options.replayEpoch) {
          frame.params = { ...params, payload: { ...params.payload, replay_epoch: this.options.replayEpoch() } }
        }

        send(frame)
        next++
      }
    }

    socket.on('message', data => {
      const frame = JSON.parse(String(data)) as Frame
      this.received.push(frame)

      for (const wake of this.waiters) {
        wake()
      }

      this.waiters.clear()

      const expected = frames[next]

      if (expected?.from === 'client' && matches(expected.frame, frame)) {
        if (expected.frame.id !== undefined && frame.id !== undefined) {
          ids.set(expected.frame.id, frame.id)
        }

        next++
        sendServerFrames()
      } else if (frame.method === 'gateway.ping' && frame.id !== undefined) {
        send({ jsonrpc: '2.0', id: frame.id, result: { ok: true } })
      } else {
        this.options.handle?.(frame, send)
      }
    })

    sendServerFrames()
  }
}
