/**
 * The one Hermes gateway this browser tab talks to, plus the HTTP and
 * WebSocket plumbing for it.
 *
 * A browser can only keep a gateway login when it is on the same origin as the
 * page (the gateway's session cookie is HttpOnly, SameSite=Lax and host-only,
 * and its CORS allow-list is loopback only). So the normal setup is: the
 * gateway serves this app (`HERMES_WEB_DIST`), or the Vite dev server proxies
 * `/api`, `/auth` and `/login` to it. In both cases the gateway URL is simply
 * the page's own origin, and nothing needs configuring.
 *
 * Auth modes, matching `hermes_cli/web_server_dashboard.py`:
 *  - Token: the gateway injects `window.__HERMES_SESSION_TOKEN__` into the
 *    served index.html. REST sends `X-Hermes-Session-Token`; the socket uses
 *    `?token=`. A `?token=` URL param or a saved token covers `vite dev`, where
 *    the page is served by Vite and the injection never happens.
 *  - Gated (OAuth or password login): REST rides the cookie jar. Each socket
 *    connect mints a single-use ticket via `POST /api/auth/ws-ticket`.
 */

import type { HermesApiRequest } from '@/global'

declare global {
  interface Window {
    __HERMES_SESSION_TOKEN__?: string
    __HERMES_BASE_PATH__?: string
  }
}

const STORAGE_KEY = 'hermes-web.gateway'
const URL_TOKEN_KEY = 'hermes-web.session-token'

export interface StoredGateway {
  /** '' means "the origin this page was served from". */
  url: string
  authMode: 'oauth' | 'token'
  token: string
}

function defaultGateway(): StoredGateway {
  return { url: '', authMode: 'oauth', token: '' }
}

export function loadGateway(): StoredGateway {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredGateway>

      return {
        url: typeof parsed.url === 'string' ? parsed.url.trim() : '',
        authMode: parsed.authMode === 'oauth' ? 'oauth' : 'token',
        token: typeof parsed.token === 'string' ? parsed.token : ''
      }
    }
  } catch {
    // Blocked or corrupt storage: fall back to the serving origin.
  }

  return defaultGateway()
}

export function saveGateway(patch: Partial<StoredGateway>): StoredGateway {
  const next = { ...loadGateway(), ...patch }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best effort. The change still applies for this page load.
  }

  return next
}

function servingBase(): string {
  const raw = window.__HERMES_BASE_PATH__ ?? ''
  const prefix = raw === '/' ? '' : raw.replace(/\/$/, '')

  return window.location.origin + prefix
}

/**
 * Turn a gateway URL into an absolute base with no trailing slash:
 * `https://host[:port]` is used as-is, `/prefix` is a path on this origin,
 * and '' is the serving origin.
 */
export function normalizeBase(url: string): string {
  const value = (url || '').trim().replace(/\/+$/, '')

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  if (value.startsWith('/')) {
    return window.location.origin + value
  }

  return servingBase()
}

export function baseUrl(): string {
  return normalizeBase(loadGateway().url)
}

export function isSameOrigin(base: string): boolean {
  try {
    return new URL(base, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * The session token to send, or '' for cookie (gated) mode. Order: the token
 * the gateway injected into the page, a `?token=` URL param (saved, then
 * removed from the address bar), a token saved from an earlier `?token=`, then
 * a token typed into Settings.
 */
export function resolveToken(): string {
  if (window.__HERMES_SESSION_TOKEN__) {
    return window.__HERMES_SESSION_TOKEN__
  }

  try {
    const url = new URL(window.location.href)
    const param = url.searchParams.get('token')

    if (param) {
      localStorage.setItem(URL_TOKEN_KEY, param)
      url.searchParams.delete('token')
      window.history.replaceState(null, '', url.toString())

      return param
    }

    const saved = localStorage.getItem(URL_TOKEN_KEY)

    if (saved) {
      return saved
    }
  } catch {
    // Fall through to the token saved in Settings.
  }

  const gateway = loadGateway()

  return gateway.authMode === 'token' ? gateway.token : ''
}

/**
 * 'token' when there is a session token to send, else 'oauth' (cookie login,
 * which covers both OAuth and password providers). Decided by what we
 * actually have, not by a saved setting: a page served through a reverse proxy
 * gets no injected token, and token mode with no token can never connect.
 */
export function activeAuthMode(): 'oauth' | 'token' {
  return resolveToken() ? 'token' : 'oauth'
}

function wsBase(): string {
  return baseUrl().replace(/^http/, 'ws')
}

export function tokenWsUrl(token: string): string {
  return `${wsBase()}/api/ws?token=${encodeURIComponent(token)}`
}

/** Thrown when the gateway rejects our credentials (401/403). */
export class GatewayAuthError extends Error {}

/** A fresh socket URL. Gated gateways need a new single-use ticket every time. */
export async function freshWsUrl(): Promise<string> {
  const token = resolveToken()

  if (token) {
    return tokenWsUrl(token)
  }

  const res = await fetch(`${baseUrl()}/api/auth/ws-ticket`, { method: 'POST', credentials: 'same-origin' })

  if (res.status === 401 || res.status === 403) {
    throw new GatewayAuthError(`${res.status}: sign-in required`)
  }

  if (!res.ok) {
    throw new Error(`${res.status}: failed to mint websocket ticket`)
  }

  const body = (await res.json()) as { ticket?: string }

  if (!body.ticket) {
    throw new Error('ws-ticket response had no ticket')
  }

  return `${wsBase()}/api/ws?ticket=${encodeURIComponent(body.ticket)}`
}

/**
 * True when the gateway currently accepts us. A token counts as signed in;
 * cookie mode asks `/api/auth/me`. Any failure reports false so the UI offers
 * a sign-in path instead of claiming a session that does not work.
 */
export async function isSignedIn(base: string = baseUrl()): Promise<boolean> {
  if (resolveToken()) {
    return true
  }

  try {
    const res = await fetch(`${base}/api/auth/me`, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(6_000)
    })

    return res.ok
  } catch {
    return false
  }
}

export interface GatewayStatus {
  auth_providers?: string[]
  auth_required?: boolean
  version?: string
}

export async function fetchStatus(base: string): Promise<GatewayStatus> {
  const res = await fetch(`${base}/api/status`, {
    credentials: 'same-origin',
    signal: AbortSignal.timeout(8_000)
  })

  if (!res.ok) {
    throw new Error(`${res.status}: ${res.statusText}`)
  }

  return (await res.json()) as GatewayStatus
}

const DEFAULT_API_TIMEOUT_MS = 30_000

function multipartBody(upload: NonNullable<HermesApiRequest['upload']>): FormData {
  const form = new FormData()
  const blob = new Blob([upload.bytes], { type: upload.contentType || 'application/octet-stream' })
  // FastAPI `UploadFile` endpoints read the field named "file" (see
  // apps/desktop/electron/main.ts, which builds the same body by hand).
  form.append('file', blob, upload.filename || 'file')

  return form
}

/**
 * REST call to the gateway. Rejects with `"NNN: message"` on an HTTP error,
 * which is the error format the renderer parses (same as the Electron IPC
 * handler).
 */
export async function apiFetch<T>(request: HermesApiRequest): Promise<T> {
  const { body, method = 'GET', path, profile, timeoutMs, upload } = request
  let url = baseUrl() + path

  if (profile) {
    url += `${url.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile)}`
  }

  const headers: Record<string, string> = {}
  const token = resolveToken()

  if (token) {
    headers['X-Hermes-Session-Token'] = token
  }

  let payload: BodyInit | undefined

  if (upload) {
    // Let the browser set the multipart boundary itself.
    payload = multipartBody(upload)
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_API_TIMEOUT_MS)
  })

  const text = await res.text()

  if (!res.ok) {
    throw new Error(`${res.status}: ${text || res.statusText}`)
  }

  if (!text) {
    return null as T
  }

  if (text.trimStart().startsWith('<')) {
    throw new Error(`Expected JSON from ${path} but got HTML`)
  }

  return JSON.parse(text) as T
}

/**
 * Browser version of the desktop's login window: open the gateway's `/login`
 * in a popup and poll our own session until it is live. The app page is never
 * navigated away (unless the popup is blocked, see below). Resolves false if
 * the popup is closed early or the login does not finish within five minutes.
 */
export function loginInPopup(base: string): Promise<boolean> {
  return new Promise(resolve => {
    const popup = window.open(`${base}/login`, 'hermes-login', 'width=520,height=720')

    if (!popup) {
      // Popup blocked. Sign in in this tab instead: the gateway's login page
      // sends the browser back to `/` afterwards, and the app boots signed in.
      // The promise never settles because the page is going away.
      window.location.assign(`${base}/login`)

      return
    }

    // Cut the popup's link back to this window so a later cross-origin page
    // (the identity provider, or a redirect it makes) cannot drive this tab.
    // `noopener` can't be used because it makes window.open return null.
    try {
      popup.opener = null
    } catch {
      // Some browsers make `opener` read-only. Polling still works.
    }

    const startedAt = Date.now()
    let settled = false

    const finish = (signedIn: boolean): void => {
      if (settled) {
        return
      }

      settled = true
      clearInterval(timer)

      try {
        if (!popup.closed) {
          popup.close()
        }
      } catch {
        // Closing a window we opened is allowed. Guard anyway.
      }

      resolve(signedIn)
    }

    const timer = setInterval(() => {
      void (async () => {
        if (settled) {
          return
        }

        if (await isSignedIn(base)) {
          finish(true)
        } else if (popup.closed || Date.now() - startedAt > 5 * 60_000) {
          finish(false)
        }
      })()
    }, 600)
  })
}
