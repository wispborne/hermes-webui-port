// The start check, signing in and signing out, through the app's gateway store,
// against a fake gateway and real SQLite databases in memory.

import { WebSocket as NodeWebSocket } from 'ws'

import { signInWithPassword } from '@/gateway/auth'
import { createRest } from '@/gateway/rest'
import { loadAppSettings, memorySettingsStore, saveAppSettings, setSettingsStoreForTests } from '@/storage/app-settings'
import { prepareGatewayDatabase } from '@/storage/database'
import { $auth, $gateway, resetStartForTests, setGatewayDepsForTests, signIn, signOut, startApp } from '@/store/gateway'

import { FakeGateway, loadRecording } from './fake-gateway'
import { FakeRest } from './fake-rest'
import { type MemoryDatabase, memoryDatabase } from './memory-database'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

const { clearCookies } = jest.requireMock('../modules/hermes-background') as { clearCookies: jest.Mock }

let rest: FakeRest
let gateway: FakeGateway
let settings: ReturnType<typeof memorySettingsStore>
/** Databases on the "phone", by gateway URL. */
let files: Map<string, MemoryDatabase>

beforeEach(async () => {
  rest = new FakeRest()
  gateway = await FakeGateway.start(loadRecording('handshake'))
  settings = memorySettingsStore()
  files = new Map()
  setSettingsStoreForTests(settings)
  setGatewayDepsForTests({
    fetchFn: rest.fetch,
    socketFactory: url => new NodeWebSocket(url) as unknown as WebSocket,
    openDatabase: async url => {
      const db = files.get(url) ?? memoryDatabase()
      files.set(url, db)

      return prepareGatewayDatabase(db, url)
    },
    deleteDatabase: async url => {
      files.delete(url)
    }
  })
  // Clearing the phone's cookies empties the fake cookie jar.
  clearCookies.mockReset()
  clearCookies.mockImplementation(async () => {
    rest.hasCookie = false
  })
  $auth.set({ phase: 'starting' })
  resetStartForTests()
})

afterEach(async () => {
  $gateway.get()?.connection.stop()
  $gateway.set(null)
  await gateway.close()
})

describe('signing in', () => {
  const login = (username: string, password: string) =>
    signInWithPassword(createRest(gateway.httpUrl, rest.fetch), username, password)

  it('signs in with the right password', async () => {
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'signed-in' })
    expect(rest.calls.find(call => call.path === '/auth/password-login')?.body).toEqual({
      provider: 'basic',
      username: 'david',
      password: 'right-password'
    })
  })

  it('says the password is wrong', async () => {
    await expect(login('david', 'nope')).resolves.toEqual({ kind: 'wrong-password' })
  })

  it('says to wait after too many attempts', async () => {
    rest.loginStatus = 429
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'too-many-attempts' })
  })

  it('says when the password store is down', async () => {
    rest.loginStatus = 503
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'password-store-down' })
  })

  it('says when the gateway has no password sign-in', async () => {
    rest.providers = [{ name: 'github', supports_password: false }]
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'no-password-sign-in' })

    rest.providers = []
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'no-password-sign-in' })
  })

  it('says when the gateway is unreachable', async () => {
    rest.reachable = false
    await expect(login('david', 'right-password')).resolves.toEqual({ kind: 'unreachable' })
  })

  it('saves the URL and the username, and never the password', async () => {
    await signIn(gateway.httpUrl, 'david', 'right-password')

    expect(loadAppSettings()).toMatchObject({ gatewayUrl: gateway.httpUrl, username: 'david' })
    expect([...settings.values.values()].join(' ')).not.toContain('right-password')
    expect($auth.get()).toEqual({ phase: 'signed-in', url: gateway.httpUrl, username: 'david' })
    await $gateway.get()?.connection.waitUntilOpen(2000)
  })
})

describe('the start check', () => {
  beforeEach(() => saveAppSettings({ gatewayUrl: gateway.httpUrl, username: 'david' }))

  it('goes to Sign in when nothing is saved', async () => {
    saveAppSettings({ gatewayUrl: null, username: null })

    await expect(startApp()).resolves.toEqual({ phase: 'signed-out', url: null, username: null })
  })

  it('goes straight to Sessions when the cookies still work', async () => {
    rest.hasCookie = true

    await expect(startApp()).resolves.toEqual({ phase: 'signed-in', url: gateway.httpUrl, username: 'david' })
    await $gateway.get()?.connection.waitUntilOpen(2000)
  })

  it('goes to Sign in, with the URL and username filled in, when the gateway refuses the session', async () => {
    rest.hasCookie = true
    rest.sessionValid = false

    await expect(startApp()).resolves.toEqual({ phase: 'signed-out', url: gateway.httpUrl, username: 'david' })
    expect($gateway.get()).toBeNull()
  })

  it('goes to Sessions offline when the gateway is unreachable', async () => {
    rest.hasCookie = true
    rest.reachable = false

    await expect(startApp()).resolves.toEqual({ phase: 'signed-in', url: gateway.httpUrl, username: 'david' })
    await gateway.waitFor(() => $gateway.get()?.connection.$status.get() === 'offline')
  })

  it('goes to Sign in when the gateway ends the session while the app runs', async () => {
    rest.hasCookie = true
    await startApp()
    await $gateway.get()?.connection.waitUntilOpen(2000)

    rest.sessionValid = false
    gateway.dropClients()

    await gateway.waitFor(() => $auth.get().phase === 'signed-out')
    expect($auth.get()).toEqual({ phase: 'signed-out', url: gateway.httpUrl, username: 'david' })
  })
})

describe('signing out', () => {
  async function signInWithSavedData() {
    await signIn(gateway.httpUrl, 'david', 'right-password')
    await $gateway.get()!.db.runAsync("INSERT INTO meta (key, value) VALUES ('saved-by-test', 'yes')")
  }

  it('ends the session on the gateway, clears the cookies and deletes saved data', async () => {
    await signInWithSavedData()

    await expect(signOut()).resolves.toEqual({ reachedGateway: true })

    expect(rest.calls.some(call => call.path === '/auth/logout')).toBe(true)
    expect(clearCookies).toHaveBeenCalledTimes(1)
    expect(files.has(gateway.httpUrl)).toBe(false)
    expect($auth.get()).toEqual({ phase: 'signed-out', url: gateway.httpUrl, username: 'david' })
  })

  it('still clears everything on the phone when the gateway is unreachable', async () => {
    await signInWithSavedData()
    rest.reachable = false

    await expect(signOut()).resolves.toEqual({ reachedGateway: false })

    expect(clearCookies).toHaveBeenCalledTimes(1)
    expect(files.has(gateway.httpUrl)).toBe(false)
    expect($auth.get().phase).toBe('signed-out')
  })

  it('keeps the appearance', async () => {
    saveAppSettings({ colorMode: 'dark', themeName: 'everforest', accent: 'pink' })
    await signInWithSavedData()
    await signOut()

    expect(loadAppSettings()).toMatchObject({ colorMode: 'dark', themeName: 'everforest', accent: 'pink' })
  })

  it('starts with no saved data when signing in again', async () => {
    await signInWithSavedData()
    await signOut()
    await signIn(gateway.httpUrl, 'david', 'right-password')

    const rows = await $gateway.get()!.db.getAllAsync("SELECT * FROM meta WHERE key = 'saved-by-test'")
    expect(rows).toEqual([])
  })
})
