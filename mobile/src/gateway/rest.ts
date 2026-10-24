// REST calls to the gateway. Sign-in rides the system cookie store: React
// Native's fetch on Android keeps the gateway's cookies and sends them back,
// so nothing here reads or writes a cookie.

const DEFAULT_TIMEOUT_MS = 30_000

/** The gateway answered with an error status. `status` is the HTTP status code. */
export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    path: string
  ) {
    super(`${status} from ${path}${body ? `: ${body.slice(0, 200)}` : ''}`)
    this.name = 'GatewayHttpError'
  }
}

/** No answer from the gateway: no network, Tailscale off, a timeout, or a proxy saying it's down. */
export class GatewayUnreachableError extends Error {
  constructor(path: string, cause?: unknown) {
    super(`Can't reach the gateway for ${path}`, { cause })
    this.name = 'GatewayUnreachableError'
  }
}

export const isSignedOutError = (error: unknown) => error instanceof GatewayHttpError && error.status === 401
export const isUnreachableError = (error: unknown) => error instanceof GatewayUnreachableError

export interface RestRequest {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT'
  /** Sent as JSON. */
  body?: unknown
  /** Added to the path as `?name=value`. Undefined values are left out. */
  query?: Record<string, string | number | boolean | undefined>
  timeoutMs?: number
}

export interface GatewayRest {
  readonly baseUrl: string
  request<T>(path: string, options?: RestRequest): Promise<T>
  get<T>(path: string, query?: RestRequest['query']): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
}

export function withQuery(path: string, query: RestRequest['query'] = {}): string {
  const pairs = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)

  return pairs.length ? `${path}${path.includes('?') ? '&' : '?'}${pairs.join('&')}` : path
}

/**
 * REST calls to one gateway. Answers are parsed as JSON; an empty answer is
 * `null`. A 502 or 504 counts as unreachable, because that is a proxy in front
 * of the gateway saying the gateway isn't answering. A 503 is left as an
 * error, because the gateway itself uses it (for example, "the password store
 * couldn't be reached").
 */
export function createRest(baseUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)): GatewayRest {
  async function request<T>(path: string, options: RestRequest = {}): Promise<T> {
    const target = withQuery(path, options.query)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const headers: Record<string, string> = { Accept: 'application/json' }

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    let response: Response

    try {
      response = await fetchFn(`${baseUrl}${target}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
        signal: controller.signal
      })
    } catch (error) {
      throw new GatewayUnreachableError(path, error)
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 502 || response.status === 504) {
      throw new GatewayUnreachableError(path)
    }

    const text = await response.text().catch(() => '')

    if (!response.ok) {
      throw new GatewayHttpError(response.status, text, path)
    }

    if (!text) {
      return null as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new GatewayHttpError(response.status, text, path)
    }
  }

  return {
    baseUrl,
    request,
    get: (path, query) => request(path, { query }),
    post: (path, body) => request(path, { method: 'POST', body })
  }
}
