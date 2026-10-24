// Password sign-in, the start check and sign-out. See GATEWAY_PROTOCOL.md,
// section 3. The gateway's cookies stay in the system cookie store.

import { clearCookies, flushCookies } from '../../modules/hermes-background'

import { GatewayHttpError, type GatewayRest, isUnreachableError } from './rest'

interface AuthProvider {
  name: string
  display_name?: string
  supports_password?: boolean
}

/** The first provider that signs in with a password, or null when the gateway has none. */
export async function passwordProvider(rest: GatewayRest): Promise<string | null> {
  try {
    const answer = await rest.get<{ providers?: AuthProvider[] } | null>('/api/auth/providers')

    return answer?.providers?.find(provider => provider.supports_password === true)?.name ?? null
  } catch (error) {
    // A gateway with no providers at all answers 503.
    if (error instanceof GatewayHttpError && error.status === 503) {
      return null
    }

    throw error
  }
}

export type SignInResult =
  | { kind: 'signed-in' }
  | { kind: 'wrong-password' }
  | { kind: 'too-many-attempts' }
  | { kind: 'no-password-sign-in' }
  | { kind: 'password-store-down' }
  | { kind: 'unreachable' }
  | { kind: 'failed'; status: number }

/**
 * Signs in with a username and password. The password is only passed through
 * to the request. On success the cookie store is written to disk at once.
 */
export async function signInWithPassword(rest: GatewayRest, username: string, password: string): Promise<SignInResult> {
  try {
    const provider = await passwordProvider(rest)

    if (!provider) {
      return { kind: 'no-password-sign-in' }
    }

    await rest.post('/auth/password-login', { provider, username, password })
    flushCookies()

    return { kind: 'signed-in' }
  } catch (error) {
    if (isUnreachableError(error)) {
      return { kind: 'unreachable' }
    }

    if (!(error instanceof GatewayHttpError)) {
      throw error
    }

    switch (error.status) {
      case 401:
        return { kind: 'wrong-password' }
      case 404:
        // The provider went away between the two calls.
        return { kind: 'no-password-sign-in' }
      case 429:
        return { kind: 'too-many-attempts' }
      case 503:
        return { kind: 'password-store-down' }
      default:
        return { kind: 'failed', status: error.status }
    }
  }
}

/** Who is signed in, as `GET /api/auth/me` describes them. */
export interface SignedInUser {
  /** The best name to show: username, then display name, then email, then id. */
  name: string | null
}

function userName(answer: unknown): string | null {
  const record = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>
  const user = (record.user && typeof record.user === 'object' ? record.user : record) as Record<string, unknown>

  for (const field of ['username', 'name', 'display_name', 'email', 'user_id', 'id', 'sub']) {
    const value = user[field]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

export type SignInCheck = { kind: 'signed-in'; user: SignedInUser } | { kind: 'signed-out' } | { kind: 'unreachable' }

/** The start check: does the gateway still accept the saved cookies? */
export async function checkSignIn(rest: GatewayRest): Promise<SignInCheck> {
  try {
    const answer = await rest.request<unknown>('/api/auth/me', { timeoutMs: 8_000 })

    return { kind: 'signed-in', user: { name: userName(answer) } }
  } catch (error) {
    if (error instanceof GatewayHttpError && (error.status === 401 || error.status === 403)) {
      return { kind: 'signed-out' }
    }

    // Anything else (no answer, a 5xx) is treated as "can't reach it right now".
    return { kind: 'unreachable' }
  }
}

/**
 * Ends the session on the gateway when it can be reached, then clears the
 * cookies on the phone either way. Never throws.
 */
export async function signOutOfGateway(rest: GatewayRest): Promise<{ reachedGateway: boolean }> {
  let reachedGateway = false

  try {
    await rest.request('/auth/logout', { method: 'POST', timeoutMs: 8_000 })
    reachedGateway = true
  } catch (error) {
    // A 401 means the gateway had already ended the session.
    reachedGateway = error instanceof GatewayHttpError
  }

  await clearCookies().catch(() => undefined)

  return { reachedGateway }
}

/** A single-use WebSocket ticket. Throws the REST error, so a 401 can be told apart. */
export async function fetchWsTicket(rest: GatewayRest): Promise<string> {
  const answer = await rest.post<{ ticket?: unknown } | null>('/api/auth/ws-ticket')

  if (typeof answer?.ticket !== 'string' || !answer.ticket) {
    throw new Error('The ws-ticket answer had no ticket.')
  }

  return answer.ticket
}
