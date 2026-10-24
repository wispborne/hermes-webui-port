// The app's one WebSocket to the gateway. See GATEWAY_PROTOCOL.md, sections 5
// and 10. Later parts of the app add their event and server-request handlers
// to `client`, and watch `$status` to know when they can make calls.

import { type GatewayClientOptions, JsonRpcGatewayClient, type WebSocketLike } from '@hermes/shared/json-rpc-gateway'
import { isStableOpen, reconnectBackoffDelayMs } from '@hermes/shared/reconnect-backoff'
import { atom, type ReadableAtom } from 'nanostores'

import { fetchWsTicket } from './auth'
import { type GatewayRest, isSignedOutError } from './rest'

/**
 * - `connecting`: getting a ticket or opening the socket.
 * - `open`: the gateway said it is ready, and the app has told it that it can
 *   answer Approvals and Questions. Calls can be made.
 * - `offline`: the gateway can't be reached. The connection tries again by itself.
 * - `signed-out`: the gateway refused the sign-in. Nothing is retried.
 * - `stopped`: not started, or stopped on purpose.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'offline' | 'signed-out' | 'stopped'

/** The gateway refused the WebSocket's ticket (`tui_gateway` close code 4401). */
const CLOSE_BAD_CREDENTIAL = 4401

export interface GatewayConnectionOptions {
  rest: GatewayRest
  /** Opens the socket. Tests pass a Node `ws` socket. */
  socketFactory?: (url: string) => WebSocketLike
  /** Delay before reconnect attempt `attempt` (0 for the first retry). */
  backoffMs?: (attempt: number) => number
  clientOptions?: Omit<GatewayClientOptions, 'socketFactory' | 'onSocketClose'>
}

const defaultBackoff = (attempt: number) => reconnectBackoffDelayMs(attempt, { baseDelayMs: 1_000, capMs: 30_000 })

export function wsUrlFor(baseUrl: string, ticket: string): string {
  return `${baseUrl.replace(/^http/i, 'ws')}/api/ws?ticket=${encodeURIComponent(ticket)}`
}

export class GatewayConnection {
  readonly client: JsonRpcGatewayClient
  private readonly status = atom<ConnectionStatus>('stopped')
  private readonly backoffMs: (attempt: number) => number
  private running = false
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private openedAt: number | null = null
  private lastCloseCode: number | null = null
  /** The current socket opened, and its close hasn't been handled yet. */
  private socketUp = false
  /** Counts dials, so the result of an old one is ignored. */
  private generation = 0

  constructor(private readonly options: GatewayConnectionOptions) {
    this.backoffMs = options.backoffMs ?? defaultBackoff
    this.client = new JsonRpcGatewayClient({
      // A prompt can take a while to be confirmed under load. Callers pass their own wait where it matters.
      requestTimeoutMs: 60_000,
      ...options.clientOptions,
      socketFactory: options.socketFactory,
      onSocketClose: event => {
        this.lastCloseCode = event.code

        return false
      }
    })

    // The shared channel sends `client.capabilities` as soon as `gateway.ready`
    // arrives, before handlers run. So by the time this runs, the gateway knows
    // the app answers Approvals and Questions, and other calls can follow.
    this.client.on('gateway.ready', () => {
      if (this.running) {
        this.status.set('open')
      }
    })

    this.client.onState(state => {
      if (state === 'open') {
        this.openedAt = Date.now()
      }

      if ((state === 'closed' || state === 'error') && this.socketUp) {
        this.socketUp = false

        if (this.running) {
          this.dropped()
        }
      }
    })
  }

  get $status(): ReadableAtom<ConnectionStatus> {
    return this.status
  }

  get isOpen(): boolean {
    return this.status.get() === 'open'
  }

  /** Connects, and keeps reconnecting until `stop()` or the gateway refuses the sign-in. */
  start() {
    if (this.running) {
      return
    }

    this.running = true
    this.attempt = 0
    void this.dial()
  }

  stop() {
    this.running = false
    this.generation++
    this.clearRetry()
    this.socketUp = false
    this.client.close()
    this.status.set('stopped')
  }

  /** Tries again now instead of waiting out the backoff, for example when the app comes back on screen. */
  retryNow() {
    if (!this.running || this.status.get() === 'open' || this.status.get() === 'connecting') {
      return
    }

    this.attempt = 0
    this.clearRetry()
    void this.dial()
  }

  /** Resolves once the connection is open. Rejects after `timeoutMs`, or at once when signed out or stopped. */
  waitUntilOpen(timeoutMs = 15_000): Promise<void> {
    if (this.isOpen) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe()
        reject(new Error('The gateway connection did not open in time.'))
      }, timeoutMs)

      const unsubscribe = this.status.listen(status => {
        if (status === 'open') {
          clearTimeout(timer)
          unsubscribe()
          resolve()
        } else if (status === 'signed-out' || status === 'stopped') {
          clearTimeout(timer)
          unsubscribe()
          reject(new Error(`The gateway connection is ${status}.`))
        }
      })
    })
  }

  private async dial() {
    const generation = ++this.generation
    this.status.set('connecting')
    this.lastCloseCode = null

    let ticket: string

    try {
      ticket = await fetchWsTicket(this.options.rest)
    } catch (error) {
      if (generation !== this.generation) {
        return
      }

      if (isSignedOutError(error)) {
        this.signedOut()
      } else {
        this.scheduleRetry()
      }

      return
    }

    if (generation !== this.generation) {
      return
    }

    try {
      await this.client.connect(wsUrlFor(this.options.rest.baseUrl, ticket))

      if (generation === this.generation) {
        if (this.client.connectionState === 'open') {
          this.socketUp = true
        } else {
          // It closed again before this line ran.
          this.dropped()
        }
      }
    } catch {
      if (generation === this.generation) {
        this.scheduleRetry()
      }
    }
  }

  private dropped() {
    const stable = isStableOpen(this.openedAt)
    this.openedAt = null

    if (stable) {
      this.attempt = 0
    }

    this.scheduleRetry()
  }

  private scheduleRetry() {
    if (!this.running) {
      return
    }

    this.clearRetry()
    this.status.set('offline')

    // A refused ticket gets one quick retry with a new ticket. If the sign-in
    // has really ended, the ticket call answers 401 and the app signs out.
    const delay = this.lastCloseCode === CLOSE_BAD_CREDENTIAL ? 0 : this.backoffMs(this.attempt)
    this.attempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.dial()
    }, delay)
  }

  private signedOut() {
    this.running = false
    this.clearRetry()
    this.socketUp = false
    this.client.close()
    this.status.set('signed-out')
  }

  private clearRetry() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }
}
