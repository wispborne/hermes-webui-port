// Which gateway the app is signed in to, and the connection and saved data
// that go with it. Screens read `$auth` and `$gateway`; the root layout sends
// the person to Sign in when `$auth` says signed out.

import type { WebSocketLike } from '@hermes/shared/json-rpc-gateway'
import { atom } from 'nanostores'

import { checkSignIn, type SignInResult, signInWithPassword, signOutOfGateway } from '@/gateway/auth'
import { GatewayConnection } from '@/gateway/connection'
import { createRest, type GatewayRest } from '@/gateway/rest'
import { loadAppSettings, saveAppSettings } from '@/storage/app-settings'
import { deleteGatewayDatabase, type GatewayDatabase, openGatewayDatabase } from '@/storage/database'
import { forgetPassword, loadPassword, savePassword } from '@/storage/saved-password'

/**
 * - `starting`: the start check hasn't finished.
 * - `signed-out`: show Sign in, with the saved URL and username filled in.
 *   `savedPasswordRefused` says the app tried the remembered password and the
 *   gateway turned it down, so it was forgotten.
 * - `signed-in`: the gateway accepted the sign-in, or couldn't be reached at
 *   start (offline-first: saved data is shown and the connection keeps trying).
 */
export type AuthState =
  | { phase: 'starting' }
  | { phase: 'signed-out'; url: string | null; username: string | null; savedPasswordRefused?: true }
  | { phase: 'signed-in'; url: string; username: string | null }

/** Everything that belongs to the signed-in gateway. */
export interface GatewayContext {
  url: string
  rest: GatewayRest
  connection: GatewayConnection
  db: GatewayDatabase
}

export const $auth = atom<AuthState>({ phase: 'starting' })
export const $gateway = atom<GatewayContext | null>(null)

export interface GatewayDeps {
  fetchFn?: typeof fetch
  socketFactory?: (url: string) => WebSocketLike
  openDatabase: (url: string) => Promise<GatewayDatabase>
  deleteDatabase: (url: string) => Promise<void>
}

let deps: GatewayDeps = { openDatabase: openGatewayDatabase, deleteDatabase: deleteGatewayDatabase }

/** Tests replace the network and the database. */
export function setGatewayDepsForTests(replacement: Partial<GatewayDeps>) {
  deps = { ...deps, ...replacement }
}

export const restFor = (url: string) => createRest(url, deps.fetchFn)

/** Hooks that run when a gateway opens or closes, so stores can load or forget its data. */
type GatewayListener = (gateway: GatewayContext | null) => void
const gatewayListeners = new Set<GatewayListener>()

export function onGatewayChange(listener: GatewayListener): () => void {
  gatewayListeners.add(listener)

  return () => gatewayListeners.delete(listener)
}

let unwatchStatus: (() => void) | null = null

async function openGateway(url: string, username: string | null): Promise<void> {
  const rest = restFor(url)
  const db = await deps.openDatabase(url)
  const connection = new GatewayConnection({ rest, socketFactory: deps.socketFactory })
  const gateway = { url, rest, connection, db }

  $gateway.set(gateway)
  $auth.set({ phase: 'signed-in', url, username })

  for (const listener of gatewayListeners) {
    listener(gateway)
  }

  unwatchStatus = connection.$status.listen(status => {
    if (status === 'signed-out') {
      void sessionEnded()
    }
  })

  connection.start()
}

async function closeGateway(): Promise<GatewayContext | null> {
  const gateway = $gateway.get()

  unwatchStatus?.()
  unwatchStatus = null

  if (!gateway) {
    return null
  }

  gateway.connection.stop()
  $gateway.set(null)

  for (const listener of gatewayListeners) {
    listener(null)
  }

  await gateway.db.closeAsync().catch(() => undefined)

  return gateway
}

/**
 * The gateway no longer accepts the sign-in. With a remembered password the
 * app signs in again by itself; otherwise it shows Sign in. Saved data is kept
 * either way.
 */
async function sessionEnded() {
  const { gatewayUrl, username } = loadAppSettings()

  await closeGateway()

  if (gatewayUrl && (await signInAgain(gatewayUrl, username))) {
    return
  }

  showSignIn(gatewayUrl, username)
}

/** When the app last signed in by itself. One try a minute stops a loop if the gateway takes the password but refuses the session. */
let lastSignInAgain = 0
const SIGN_IN_AGAIN_GAP_MS = 60_000

/** Signs in with the remembered password, if there is one for this gateway and username. True when it worked. */
async function signInAgain(url: string, username: string | null): Promise<boolean> {
  const password = username ? await loadPassword(url, username) : null

  if (!username || !password || Date.now() - lastSignInAgain < SIGN_IN_AGAIN_GAP_MS) {
    return false
  }

  lastSignInAgain = Date.now()
  const result = await signIn(url, username, password, { remember: true })

  // The password changed on the gateway, or it no longer signs in with one: the saved password is no use.
  if (result.kind === 'wrong-password' || result.kind === 'no-password-sign-in') {
    await forgetPassword()
    $auth.set({ phase: 'signed-out', url, username, savedPasswordRefused: true })
  }

  return result.kind === 'signed-in'
}

/** Sign in, unless signing in again already set a reason for showing it. */
function showSignIn(url: string | null, username: string | null) {
  const current = $auth.get()

  if (current.phase !== 'signed-out' || !current.savedPasswordRefused) {
    $auth.set({ phase: 'signed-out', url, username })
  }
}

let starting: Promise<AuthState> | null = null

/**
 * The start check. With a saved gateway, `GET /api/auth/me` decides:
 * signed in, signed out, or unreachable (treated as signed in, offline).
 * Runs once; later calls get the same answer.
 */
export function startApp(): Promise<AuthState> {
  starting ??= runStartCheck()

  return starting
}

/** Tests run the start check more than once. */
export function resetStartForTests() {
  starting = null
  lastSignInAgain = 0
}

async function runStartCheck(): Promise<AuthState> {
  const { gatewayUrl, username } = loadAppSettings()

  if (!gatewayUrl) {
    $auth.set({ phase: 'signed-out', url: null, username })

    return $auth.get()
  }

  const check = await checkSignIn(restFor(gatewayUrl))

  if (check.kind === 'signed-out') {
    if (!(await signInAgain(gatewayUrl, username))) {
      showSignIn(gatewayUrl, username)
    }
  } else {
    await openGateway(gatewayUrl, username)
  }

  return $auth.get()
}

/**
 * Signs in and opens the gateway. The URL and the username go in the app
 * settings. The password is kept in secure storage when `remember` is on, and
 * any remembered one is forgotten when it is off.
 */
export async function signIn(url: string, username: string, password: string, { remember = false } = {}): Promise<SignInResult> {
  const result = await signInWithPassword(restFor(url), username, password)

  if (result.kind === 'signed-in') {
    const previous = loadAppSettings().gatewayUrl

    await closeGateway()
    saveAppSettings({ gatewayUrl: url, username, rememberPassword: remember })
    await (remember ? savePassword(url, username, password) : forgetPassword())

    // Only one gateway is kept on the phone.
    if (previous && previous !== url) {
      await deps.deleteDatabase(previous).catch(() => undefined)
    }

    await openGateway(url, username)
  }

  return result
}

/**
 * Ends the session on the gateway when it can be reached, clears the cookies,
 * and deletes everything saved for the gateway, the remembered password too.
 * The URL and username stay.
 */
export async function signOut(): Promise<{ reachedGateway: boolean }> {
  const { gatewayUrl, username } = loadAppSettings()
  const gateway = await closeGateway()
  await forgetPassword()
  const url = gateway?.url ?? gatewayUrl
  const result = url ? await signOutOfGateway(restFor(url)) : { reachedGateway: false }

  if (url) {
    await deps.deleteDatabase(url)
  }

  $auth.set({ phase: 'signed-out', url, username })

  return result
}
