import { WebSocket as NodeWebSocket } from 'ws'

import { GatewayConnection } from '@/gateway/connection'
import { createRest } from '@/gateway/rest'

import { FakeGateway, loadRecording } from './fake-gateway'
import { FakeRest } from './fake-rest'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn(async () => undefined) }))

describe('GatewayConnection', () => {
  let gateway: FakeGateway
  let rest: FakeRest
  let connection: GatewayConnection

  beforeEach(async () => {
    rest = new FakeRest()
    rest.hasCookie = true
    gateway = await FakeGateway.start(loadRecording('handshake'), {
      acceptTicket: ticket => ticket !== null && rest.tickets.includes(ticket)
    })
    connection = new GatewayConnection({
      rest: createRest(gateway.httpUrl, rest.fetch),
      socketFactory: url => new NodeWebSocket(url) as unknown as WebSocket,
      backoffMs: () => 10
    })
  })

  afterEach(async () => {
    connection.stop()
    await gateway.close()
  })

  it('connects with a fresh ticket and opens once the gateway is ready', async () => {
    connection.start()
    await connection.waitUntilOpen(2000)

    expect(connection.$status.get()).toBe('open')
    expect(gateway.tickets).toEqual(['ticket-1'])
  })

  it('tells the gateway it answers server requests before sending anything else', async () => {
    connection.start()
    await connection.waitUntilOpen(2000)
    void connection.client.request('session.list', { limit: 1 }).catch(() => undefined)

    await gateway.clientFrame(frame => frame.method === 'session.list')
    expect(gateway.received[0]).toMatchObject({ method: 'client.capabilities', params: { server_requests: true } })
  })

  it('reconnects with a new ticket after the connection drops', async () => {
    const statuses: string[] = []
    connection.$status.listen(status => statuses.push(status))
    connection.start()
    await connection.waitUntilOpen(2000)

    gateway.dropClients()
    await gateway.waitFor(() => gateway.tickets.length === 2 && connection.isOpen)

    expect(gateway.tickets).toEqual(['ticket-1', 'ticket-2'])
    expect(statuses).toEqual(expect.arrayContaining(['open', 'offline', 'connecting']))
    expect(statuses.at(-1)).toBe('open')
  })

  it('keeps trying while the gateway is unreachable', async () => {
    rest.reachable = false
    connection.start()
    await gateway.waitFor(() => rest.calls.length >= 3)

    expect(connection.$status.get()).not.toBe('signed-out')

    rest.reachable = true
    await connection.waitUntilOpen(2000)
  })

  it('reports signed out when the ticket call answers 401', async () => {
    rest.sessionValid = false
    connection.start()
    await gateway.waitFor(() => connection.$status.get() === 'signed-out')

    expect(gateway.tickets).toEqual([])
  })

  it('retries once at once after close code 4401, then signs out when the ticket call answers 401', async () => {
    connection.start()
    await connection.waitUntilOpen(2000)

    // The gateway ends the session: the socket is refused and so is the next ticket.
    gateway.options.acceptTicket = () => false
    rest.sessionValid = false
    gateway.dropClients()

    await gateway.waitFor(() => connection.$status.get() === 'signed-out')
  })
})
