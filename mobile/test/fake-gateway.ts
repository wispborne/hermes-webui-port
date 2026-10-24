// A gateway for tests: a WebSocket server in the test process that plays back
// a recording from test/fixtures/ and keeps every frame the client sends.
//
// Server frames are sent in order until the recording expects a client frame.
// Playback then waits for the client to send a frame with the same method (or,
// for an answer to a server request, the same id). The ids of the client's
// requests differ from the recorded ones, so server answers are rewritten to
// use the client's ids. A `gateway.ping` that isn't in the recording is
// answered the way the gateway answers it.

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

const matches = (recorded: Frame, live: Frame) =>
  recorded.method !== undefined ? recorded.method === live.method : live.method === undefined && recorded.id === live.id

export class FakeGateway {
  /** Every frame clients sent, in order. */
  readonly received: Frame[] = []
  private readonly waiters = new Set<() => void>()

  private constructor(
    private readonly server: WebSocketServer,
    private readonly recording: Recording
  ) {
    server.on('connection', socket => this.play(socket))
  }

  static async start(recording: Recording): Promise<FakeGateway> {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => server.once('listening', resolve))

    return new FakeGateway(server, recording)
  }

  get url(): string {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}/api/ws`
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
      }
    })

    sendServerFrames()
  }
}
