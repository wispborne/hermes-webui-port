// A gateway's REST API for tests, as a `fetch` function. It keeps the state a
// real gateway and the phone's cookie store would: whether the phone holds a
// session cookie, and whether the gateway still accepts it.
//
// Later tests add routes with `route()`.

export interface FakeRestCall {
  method: string
  path: string
  body: unknown
}

type Handler = (call: FakeRestCall, query: URLSearchParams) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export class FakeRest {
  /** Accounts on the gateway. */
  users = new Map([['david', 'right-password']])
  providers: unknown[] = [{ name: 'basic', display_name: 'Password', supports_password: true }]
  /** False makes every call fail as if Tailscale were off. */
  reachable = true
  /** The phone holds a session cookie. */
  hasCookie = false
  /** The gateway still accepts the cookie. */
  sessionValid = true
  /** Set to answer password-login with this status instead. */
  loginStatus: number | null = null
  version = '0.22.4'
  readonly calls: FakeRestCall[] = []
  private ticketCount = 0
  readonly tickets: string[] = []
  private readonly routes: { method: string; pattern: RegExp; handler: Handler }[] = []

  get signedIn() {
    return this.hasCookie && this.sessionValid
  }

  route(method: string, pattern: RegExp, handler: Handler) {
    this.routes.push({ method, pattern, handler })
  }

  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input))
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    const call = { method, path: url.pathname, body }

    this.calls.push(call)

    if (!this.reachable) {
      throw new TypeError('Network request failed')
    }

    for (const route of this.routes) {
      if (route.method === method && route.pattern.test(url.pathname)) {
        if (!this.signedIn) {
          return json(401, { detail: 'Not authenticated' })
        }

        const answer = await route.handler(call, url.searchParams)

        return json(answer.status ?? 200, answer.body)
      }
    }

    switch (`${method} ${url.pathname}`) {
      case 'GET /api/status':
        return json(200, { version: this.version, auth_required: true })

      case 'GET /api/auth/providers':
        return this.providers.length ? json(200, { providers: this.providers }) : json(503, { detail: 'no providers' })

      case 'POST /auth/password-login': {
        if (this.loginStatus !== null) {
          return json(this.loginStatus, { detail: 'refused' })
        }

        const { provider, username, password } = body as { provider: string; username: string; password: string }

        if (!this.providers.some(p => (p as { name: string }).name === provider)) {
          return json(404, { detail: 'unknown provider' })
        }

        if (this.users.get(username) !== password) {
          return json(401, { detail: 'Invalid username or password' })
        }

        this.hasCookie = true
        this.sessionValid = true

        return json(200, { ok: true, next: '/' })
      }

      case 'GET /api/auth/me':
        return this.signedIn ? json(200, { user: { username: 'david', provider: 'basic' } }) : json(401)

      case 'POST /api/auth/ws-ticket': {
        if (!this.signedIn) {
          return json(401)
        }

        const ticket = `ticket-${++this.ticketCount}`
        this.tickets.push(ticket)

        return json(200, { ticket, ttl_seconds: 30 })
      }

      case 'POST /auth/logout':
        this.hasCookie = false

        return json(200, { ok: true })
    }

    return json(404, { detail: `No route for ${method} ${url.pathname}` })
  }
}
