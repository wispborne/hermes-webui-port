// Delivered files in a Session's text: the store and the saved transcript keep
// the MEDIA directive exactly as the gateway wrote it, and the bytes come from
// `GET /api/fs/read-data-url` when a bubble asks for them. Reading the file is
// a render concern (see the bubble tests), not a storage one.

import { mediaName } from '@/chat/media'
import { clearMediaDataCache, loadMediaDataUrl } from '@/gateway/media-api'
import type { GatewayRest } from '@/gateway/rest'
import { loadTranscript } from '@/storage/transcripts'
import { chatStore, flushDeltas, openChat, sendMessage } from '@/store/chat'

import { ChatGateway } from './chat-gateway'
import { SAMPLE_DATA_URL } from './fake-rest'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let h: Harness
let g: ChatGateway

const CHART = '/opt/data/image_cache/chart.png'
const CHART_TEXT = `Here is the chart:\nMEDIA:${CHART}\nIt shows the beds.`

beforeEach(async () => {
  clearMediaDataCache()
  h = await signedInHarness()
  g = new ChatGateway(h)
  h.rest.fsFiles.set(CHART, SAMPLE_DATA_URL)
})

afterEach(() => h.close())

const assistantTexts = (key: string) => {
  flushDeltas()

  return chatStore(key).get().items.filter(item => item.kind === 'assistant').map(item => (item.kind === 'assistant' ? item.text : ''))
}

const fileReads = () => h.rest.calls.filter(call => call.path === '/api/fs/read-data-url')

describe('the text the store keeps', () => {
  it('keeps a directive from a saved transcript row exactly as it was written', async () => {
    g.addSession('s1', [['assistant', CHART_TEXT]])
    await openChat('s1')

    expect(assistantTexts('s1')).toEqual([CHART_TEXT])
  })

  it('saves the directive in the transcript on the phone, so a reopen shows it again', async () => {
    g.addSession('s1', [['assistant', CHART_TEXT]])
    await openChat('s1')

    const saved = await loadTranscript(h.db, 's1')

    expect(saved?.items.map(item => (item.kind === 'assistant' ? item.text : item.kind))).toEqual([CHART_TEXT])
  })

  it('keeps a directive that arrives while the reply streams, including a path cut in half', async () => {
    g.addSession('s1', [['user', 'Draw the beds']])
    await openChat('s1')

    const partial = 'Here is the chart:\nMEDIA:/opt/data/image_cache/char'

    g.emit('s1', 'message.start')
    g.emit('s1', 'message.delta', { text: partial })
    await until(() => assistantTexts('s1').at(-1) === partial)

    g.emit('s1', 'message.delta', { text: 't.png' })
    g.emit('s1', 'message.complete', { text: CHART_TEXT, status: 'complete' })
    await until(() => assistantTexts('s1').at(-1) === CHART_TEXT)

    expect(assistantTexts('s1')).toEqual([CHART_TEXT])
  })

  it('keeps a directive in the message the person sent', async () => {
    g.addSession('s1', [['user', 'Hi']])
    await openChat('s1')

    await sendMessage('s1', `Look at MEDIA:${CHART}`)
    flushDeltas()

    const mine = chatStore('s1').get().items.filter(item => item.kind === 'user').map(item => (item.kind === 'user' ? item.text : ''))

    expect(mine).toEqual(['Hi', `Look at MEDIA:${CHART}`])
  })
})

describe('reading a delivered file from the gateway', () => {
  it('asks for the data URL for the path', async () => {
    expect(await loadMediaDataUrl(h.context.rest, CHART)).toBe(SAMPLE_DATA_URL)
    expect(fileReads()).toEqual([{ method: 'GET', path: '/api/fs/read-data-url', body: undefined }])
  })

  it('asks once and reuses the answer while the list redraws', async () => {
    await loadMediaDataUrl(h.context.rest, CHART)
    await loadMediaDataUrl(h.context.rest, CHART)
    await loadMediaDataUrl(h.context.rest, CHART)

    expect(fileReads()).toHaveLength(1)
  })

  it('shares one read between two bubbles asking for the same file', async () => {
    const [first, second] = await Promise.all([loadMediaDataUrl(h.context.rest, CHART), loadMediaDataUrl(h.context.rest, CHART)])

    expect(first).toBe(SAMPLE_DATA_URL)
    expect(second).toBe(SAMPLE_DATA_URL)
    expect(fileReads()).toHaveLength(1)
  })

  it('fails when the gateway has no such file, and tries again next time', async () => {
    await expect(loadMediaDataUrl(h.context.rest, '/tmp/gone.png')).rejects.toThrow(/404/)
    expect(fileReads()).toHaveLength(1)

    h.rest.fsFiles.set('/tmp/gone.png', SAMPLE_DATA_URL)
    expect(await loadMediaDataUrl(h.context.rest, '/tmp/gone.png')).toBe(SAMPLE_DATA_URL)
    expect(fileReads()).toHaveLength(2)
  })

  it('fails when the gateway can not be reached', async () => {
    h.rest.reachable = false

    await expect(loadMediaDataUrl(h.context.rest, CHART)).rejects.toThrow(/Can't reach the gateway/)
  })

  it('stops reading a file that a bigger transcript pushed out of the cache', async () => {
    for (let i = 0; i < 20; i++) {
      h.rest.fsFiles.set(`/tmp/c${i}.png`, SAMPLE_DATA_URL)
      await loadMediaDataUrl(h.context.rest, `/tmp/c${i}.png`)
    }

    expect(fileReads()).toHaveLength(20)

    // The first file was the least recently used, so it is read again.
    await loadMediaDataUrl(h.context.rest, '/tmp/c0.png')
    expect(fileReads()).toHaveLength(21)
  })

  it('keeps big files only up to the size limit', async () => {
    const big = `data:image/png;base64,${'A'.repeat(10_000_000)}`

    for (const name of ['big1', 'big2', 'big3']) {
      h.rest.fsFiles.set(`/tmp/${name}.png`, big)
      await loadMediaDataUrl(h.context.rest, `/tmp/${name}.png`)
    }

    // Three 10 MB files are over the limit, so the oldest is read again.
    await loadMediaDataUrl(h.context.rest, '/tmp/big1.png')
    expect(fileReads()).toHaveLength(4)
  })

  it('reads the file again from another gateway with the same path', async () => {
    await loadMediaDataUrl(h.context.rest, CHART)
    const other = { get: () => Promise.reject(new Error('another gateway')) } as unknown as GatewayRest

    await expect(loadMediaDataUrl(other, CHART)).rejects.toThrow('another gateway')
    await loadMediaDataUrl(h.context.rest, CHART)

    expect(fileReads()).toHaveLength(2)
  })

  it('uses a data: or http value as it is, with no read', async () => {
    expect(await loadMediaDataUrl(h.context.rest, SAMPLE_DATA_URL)).toBe(SAMPLE_DATA_URL)
    expect(await loadMediaDataUrl(h.context.rest, 'https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg')

    expect(fileReads()).toHaveLength(0)
  })
})

describe('the name shown for a deliverable', () => {
  it('is the file name, not the whole path', () => {
    expect(mediaName(CHART)).toBe('chart.png')
  })
})
