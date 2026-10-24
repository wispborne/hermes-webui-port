// Reconnecting at once on network changes, against the fake gateway.

import { applyNetworkChange, networkAction } from '@/background/reconnect'

import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

const wifi = { isConnected: true, type: 'wifi', address: '192.168.1.20' }
const cellular = { isConnected: true, type: 'cellular', address: '10.20.0.5' }
const none = { isConnected: false, type: 'none', address: null }

describe('networkAction', () => {
  it('retries when the network comes back', () => {
    expect(networkAction(none, wifi)).toBe('retry')
    expect(networkAction(null, wifi)).toBe('retry')
  })

  it('reconnects when the phone moves to another network', () => {
    expect(networkAction(wifi, cellular)).toBe('reconnect')
    expect(networkAction(wifi, { ...wifi, address: '100.64.0.7' })).toBe('reconnect')
  })

  it('does nothing when the network goes away or stays the same', () => {
    expect(networkAction(wifi, none)).toBe('none')
    expect(networkAction(wifi, { ...wifi })).toBe('none')
  })
})

describe('with the fake gateway', () => {
  let h: Harness

  beforeEach(async () => {
    h = await signedInHarness()
  })

  afterEach(() => h.close())

  it('connects at once when the network comes back, instead of waiting out the backoff', async () => {
    const { connection } = h.context
    h.rest.reachable = false
    h.gateway.dropClients()
    // Several failed attempts make the next wait long.
    await until(() => h.rest.calls.filter(call => call.path === '/api/auth/ws-ticket').length >= 3, 15_000)

    h.rest.reachable = true
    const startedAt = Date.now()
    applyNetworkChange(connection, none, wifi)
    await connection.waitUntilOpen(1000)

    expect(Date.now() - startedAt).toBeLessThan(1000)
  }, 20_000)

  it('drops the old socket and connects again on a network change', async () => {
    const { connection } = h.context
    const before = h.gateway.tickets.length

    applyNetworkChange(connection, wifi, cellular)
    await until(() => h.gateway.tickets.length === before + 1 && connection.isOpen)
  })
})
