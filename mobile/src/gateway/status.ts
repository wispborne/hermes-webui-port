import { BUILT_FOR_HERMES_VERSION } from './built-for-version'

/** What checking a gateway URL found. */
export type GatewayCheck =
  | { kind: 'gateway'; url: string; version: string }
  | { kind: 'not-a-gateway'; url: string }
  | { kind: 'unreachable'; url: string }
  | { kind: 'invalid-url' }

const CHECK_TIMEOUT_MS = 8_000

/**
 * The gateway URL in the form the app uses: trimmed, with `https://` added when
 * no scheme was typed, and no trailing slash. Null when it isn't an http or
 * https address.
 */
export function normalizeGatewayUrl(input: string): string | null {
  const text = input.trim()

  if (!text) {
    return null
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`

  try {
    const url = new URL(withScheme)

    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) {
      return null
    }

    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/** Hermes versions are written with or without a leading "v". */
export const sameHermesVersion = (a: string, b: string) => a.trim().replace(/^v/, '') === b.trim().replace(/^v/, '')

/** True when the gateway runs a different Hermes version from the one this build was made for. */
export const versionDiffers = (gatewayVersion: string) => !sameHermesVersion(gatewayVersion, BUILT_FOR_HERMES_VERSION)

/**
 * Checks a gateway URL with `GET /api/status`, which needs no sign-in.
 *
 * - No answer, or a proxy saying the gateway is down (502, 503, 504): unreachable.
 * - An answer without a Hermes version in it: not a gateway.
 */
export async function checkGateway(input: string, fetchFn: typeof fetch = fetch): Promise<GatewayCheck> {
  const url = normalizeGatewayUrl(input)

  if (!url) {
    return { kind: 'invalid-url' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetchFn(`${url}/api/status`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
  } catch {
    return { kind: 'unreachable', url }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return { kind: 'unreachable', url }
  }

  if (!response.ok) {
    return { kind: 'not-a-gateway', url }
  }

  try {
    const status = (await response.json()) as { version?: unknown } | null
    const version = status?.version

    if (typeof version === 'string' && version.trim()) {
      return { kind: 'gateway', url, version: version.trim().replace(/^v(?=\d)/, '') }
    }
  } catch {
    // Not JSON, so not a gateway.
  }

  return { kind: 'not-a-gateway', url }
}
