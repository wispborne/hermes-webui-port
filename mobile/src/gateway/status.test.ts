import { checkGateway, normalizeGatewayUrl, versionDiffers } from './status'

const answer = (status: number, body: unknown) =>
  jest.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))

describe('normalizeGatewayUrl', () => {
  it('adds https:// when no scheme was typed', () => {
    expect(normalizeGatewayUrl(' hermes-dashboard.wispborne.com/ ')).toBe('https://hermes-dashboard.wispborne.com')
  })

  it('keeps http and a port', () => {
    expect(normalizeGatewayUrl('http://100.64.0.1:9119')).toBe('http://100.64.0.1:9119')
  })

  it('refuses other schemes and empty text', () => {
    expect(normalizeGatewayUrl('ftp://example.com')).toBeNull()
    expect(normalizeGatewayUrl('   ')).toBeNull()
  })
})

describe('checkGateway', () => {
  it('reports the version when the gateway answers', async () => {
    const fetchFn = answer(200, { version: '0.22.4', auth_required: true })

    await expect(checkGateway('https://hermes-dashboard.wispborne.com', fetchFn)).resolves.toEqual({
      kind: 'gateway',
      url: 'https://hermes-dashboard.wispborne.com',
      version: '0.22.4'
    })
    expect(fetchFn).toHaveBeenCalledWith('https://hermes-dashboard.wispborne.com/api/status', expect.anything())
  })

  it('says an address that answers without a version is not a gateway', async () => {
    await expect(checkGateway('https://example.com', answer(200, '<html></html>'))).resolves.toMatchObject({
      kind: 'not-a-gateway'
    })
    await expect(checkGateway('https://example.com', answer(200, { ok: true }))).resolves.toMatchObject({
      kind: 'not-a-gateway'
    })
    await expect(checkGateway('https://example.com', answer(404, 'Not found'))).resolves.toMatchObject({
      kind: 'not-a-gateway'
    })
  })

  it('says the gateway is unreachable when nothing answers', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('Network request failed')
    })

    await expect(checkGateway('https://hermes-dashboard.wispborne.com', fetchFn)).resolves.toMatchObject({
      kind: 'unreachable'
    })
  })

  it('says the gateway is unreachable when a proxy says it is down', async () => {
    await expect(checkGateway('https://example.com', answer(502, 'Bad gateway'))).resolves.toMatchObject({
      kind: 'unreachable'
    })
  })

  it('says when the URL is not an address', async () => {
    await expect(checkGateway('mailto:me@example.com', answer(200, {}))).resolves.toEqual({ kind: 'invalid-url' })
  })
})

describe('versionDiffers', () => {
  it('compares with the built-for version, with or without a leading v', () => {
    expect(versionDiffers('0.22.4')).toBe(false)
    expect(versionDiffers('v0.22.4')).toBe(false)
    expect(versionDiffers('0.23.0')).toBe(true)
  })
})
