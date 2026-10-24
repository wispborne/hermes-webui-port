import { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'
import { WebSocket as NodeWebSocket } from 'ws'

import { FakeGateway, loadRecording } from './fake-gateway'

describe('JsonRpcGatewayClient against the fake gateway', () => {
  let gateway: FakeGateway
  let client: JsonRpcGatewayClient

  beforeEach(async () => {
    gateway = await FakeGateway.start(loadRecording('handshake'))
    client = new JsonRpcGatewayClient({
      socketFactory: url => new NodeWebSocket(url) as unknown as WebSocket
    })
  })

  afterEach(async () => {
    client.close()
    await gateway.close()
  })

  it('gets gateway.ready and answers with client.capabilities', async () => {
    const ready = new Promise(resolve => client.on('gateway.ready', resolve))

    await client.connect(gateway.url)

    await expect(ready).resolves.toMatchObject({ type: 'gateway.ready', payload: { replay_epoch: 'test-epoch' } })
    await expect(gateway.clientFrame(frame => frame.method === 'client.capabilities')).resolves.toMatchObject({
      params: { server_requests: true }
    })
    expect(client.connectionState).toBe('open')
  })
})
