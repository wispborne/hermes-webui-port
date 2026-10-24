// Signs the app's stores in to a fake gateway: FakeRest for REST, FakeGateway
// for the WebSocket, and a real SQLite database in memory.
//
// Test files that use it must mock the native module first:
//   jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

import { WebSocket as NodeWebSocket } from 'ws'

import { memorySettingsStore, setSettingsStoreForTests } from '@/storage/app-settings'
import { prepareGatewayDatabase } from '@/storage/database'
import { $auth, $gateway, type GatewayContext, setGatewayDepsForTests, signIn } from '@/store/gateway'

import { type FakeGatewayOptions, FakeGateway, type Frame, loadRecording, result } from './fake-gateway'
import { FakeRest } from './fake-rest'
import { type MemoryDatabase, memoryDatabase } from './memory-database'

export interface Harness {
  rest: FakeRest
  gateway: FakeGateway
  db: MemoryDatabase
  context: GatewayContext
  /** Answers for WebSocket methods, by method name. Tests add their own. */
  methods: Map<string, (frame: Frame) => unknown>
  close(): Promise<void>
}

/** Waits until `test` passes, checking every 10 ms. */
export async function until(test: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (!test()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting.')
    }

    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

export async function signedInHarness(options: FakeGatewayOptions = {}): Promise<Harness> {
  const rest = new FakeRest()
  const methods = new Map<string, (frame: Frame) => unknown>()
  const gateway = await FakeGateway.start(loadRecording('handshake'), {
    ...options,
    handle: (frame, reply) => {
      const answer = frame.method ? methods.get(frame.method) : undefined

      if (answer) {
        const value = answer(frame)

        if (value !== undefined) {
          reply(result(frame, value))
        }
      } else {
        options.handle?.(frame, reply)
      }
    }
  })
  const db = memoryDatabase()

  setSettingsStoreForTests(memorySettingsStore())
  setGatewayDepsForTests({
    fetchFn: rest.fetch,
    socketFactory: url => new NodeWebSocket(url) as unknown as WebSocket,
    openDatabase: async url => prepareGatewayDatabase(db, url),
    deleteDatabase: async () => undefined
  })
  $auth.set({ phase: 'starting' })

  await signIn(gateway.httpUrl, 'david', 'right-password')
  const context = $gateway.get()!
  await context.connection.waitUntilOpen(2000)

  return {
    rest,
    gateway,
    db,
    context,
    methods,
    async close() {
      $gateway.get()?.connection.stop()
      $gateway.set(null)
      await gateway.close()
    }
  }
}
