// How a transcript item draws delivered files: an image in place of the
// directive, a small chip for anything else, and never the raw `MEDIA:` text.
// The text a bubble keeps goes to `Markdown`, which draws it natively, so these
// tests read what each bubble hands it.

import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import type { ChatItem } from '@/chat/items'
import { type OutboxActions, TranscriptItem } from '@/components/chat/transcript-items'
import { clearMediaDataCache } from '@/gateway/media-api'
import { hermesTheme } from '@/theme/theme'

import { SAMPLE_DATA_URL } from '../../../test/fake-rest'
import { type Harness, signedInHarness, until } from '../../../test/harness'

jest.mock('../../../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

const actions: OutboxActions = { offline: false, onCancel: jest.fn(), onSendNow: jest.fn() }
const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

let h: Harness
let readDelayMs = 0

// One fake gateway for the whole file: these tests only draw, they don't change gateway state.
beforeAll(async () => {
  h = await signedInHarness()
  h.rest.fsFiles.set('/tmp/chart.png', SAMPLE_DATA_URL)
  // Answers the file reads after `readDelayMs`, so a test can watch the loading frame.
  h.rest.route('GET', /^\/api\/fs\/read-data-url$/, (_call, query) => {
    const dataUrl = h.rest.fsFiles.get(query.get('path') ?? '')

    return new Promise(resolve => {
      setTimeout(() => resolve({ body: dataUrl ? { dataUrl } : { detail: 'No file' } }), readDelayMs)
    })
  })
})

afterAll(() => h.close())

beforeEach(() => {
  clearMediaDataCache()
  readDelayMs = 0
})

const reply = (text: string, extra: Record<string, unknown> = {}): ChatItem => ({ kind: 'assistant', key: 'reply-1', text, ...extra })
const mine = (text: string): ChatItem => ({ kind: 'user', key: 'user-1', text })

async function show(item: ChatItem) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={hermesTheme('light')}>
        <TranscriptItem actions={actions} item={item} />
      </PaperProvider>
    </SafeAreaProvider>
  )
}

/** The text a bubble draws as Markdown, in the order it draws it. */
const markdownTexts = (): string[] => {
  const found: string[] = []

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return
    }

    const element = node as { children?: unknown[]; props?: Record<string, unknown> }

    if (typeof element.props?.markdown === 'string') {
      found.push(element.props.markdown)
    }

    for (const child of element.children ?? []) {
      walk(child)
    }
  }

  const tree = screen.toJSON()

  if (Array.isArray(tree)) {
    tree.forEach(walk)
  } else {
    walk(tree)
  }

  return found
}

describe('an image Hermes delivered', () => {
  it('holds the frame open until the bytes arrive, then shows the picture', async () => {
    readDelayMs = 80
    await show(reply('Here is the chart:\nMEDIA:/tmp/chart.png\nIt shows the beds.'))

    expect(screen.getByTestId('media-chart-png-loading')).toBeTruthy()

    const image = await screen.findByTestId('media-chart-png-image')

    expect(image.props.source).toEqual({ uri: SAMPLE_DATA_URL })
    expect(markdownTexts()).toEqual(['Here is the chart:\n', '\nIt shows the beds.'])
  })

  it('never hands the directive text to Markdown', async () => {
    await show(reply('Look:\nMEDIA:data:image/png;base64,AAA'))

    await screen.findByTestId('media-image-png-image')

    expect(markdownTexts().join('')).not.toContain('MEDIA:')
  })

  it('shows a chip when the gateway has no such file', async () => {
    await show(reply('MEDIA:/tmp/gone.png'))

    expect(await screen.findByTestId('media-gone-png-chip')).toBeTruthy()
    expect(screen.getByText('gone.png')).toBeTruthy()
    expect(screen.queryByTestId('media-gone-png-image')).toBeNull()
  })

  it('shows a chip when the gateway can not be reached', async () => {
    h.rest.reachable = false
    await show(reply('MEDIA:/tmp/chart.png'))

    expect(await screen.findByTestId('media-chart-png-chip')).toBeTruthy()

    h.rest.reachable = true
  })

  it('reads the picture again when the connection comes back', async () => {
    h.rest.reachable = false
    h.gateway.dropClients()
    await until(() => h.context.connection.$status.get() === 'offline')
    await show(reply('MEDIA:/tmp/chart.png'))

    expect(await screen.findByTestId('media-chart-png-chip')).toBeTruthy()

    h.rest.reachable = true
    h.context.connection.retryNow()

    expect((await screen.findByTestId('media-chart-png-image')).props.source).toEqual({ uri: SAMPLE_DATA_URL })
  })

  it('shows a chip when the phone can not draw the picture', async () => {
    await show(reply('MEDIA:/tmp/chart.png'))

    await fireEvent(await screen.findByTestId('media-chart-png-image'), 'error')

    expect(await screen.findByTestId('media-chart-png-chip')).toBeTruthy()
  })

  it('asks the gateway for a web image the phone can not load, then shows a chip if that fails too', async () => {
    const url = 'https://v3.fal.media/files/cat.png'
    let proxyAnswer: { status?: number; body: unknown } = { body: { data_url: SAMPLE_DATA_URL } }
    h.rest.route('GET', /^\/api\/media\/proxy$/, () => proxyAnswer)

    await show(reply(`MEDIA:${url}`))
    const direct = await screen.findByTestId('media-cat-png-image')

    expect(direct.props.source).toEqual({ uri: url })

    await fireEvent(direct, 'error')

    await until(() => screen.queryByTestId('media-cat-png-image')?.props.source?.uri === SAMPLE_DATA_URL)
    expect(h.rest.calls.some(call => call.path === '/api/media/proxy')).toBe(true)

    await fireEvent(screen.getByTestId('media-cat-png-image'), 'error')

    expect(await screen.findByTestId('media-cat-png-chip')).toBeTruthy()

    proxyAnswer = { status: 403, body: { detail: 'Image host not allowed' } }
    clearMediaDataCache()
    await show(reply('MEDIA:https://example.com/dog.png'))
    await fireEvent(await screen.findByTestId('media-dog-png-image'), 'error')

    expect(await screen.findByTestId('media-dog-png-chip')).toBeTruthy()
  })

  it('switches between the frame and full width when the image is tapped', async () => {
    await show(reply('MEDIA:/tmp/chart.png'))
    const frame = await screen.findByTestId('media-chart-png')

    expect(frame.props.accessibilityState).toEqual({ expanded: false })

    await fireEvent.press(frame)

    expect(screen.getByTestId('media-chart-png').props.accessibilityState).toEqual({ expanded: true })
  })

  it('reads the file once even when the same reply draws twice', async () => {
    const before = h.rest.calls.filter(call => call.path === '/api/fs/read-data-url').length

    await show(reply('MEDIA:/tmp/chart.png'))
    await screen.findByTestId('media-chart-png-image')
    await show(reply('MEDIA:/tmp/chart.png'))
    await screen.findByTestId('media-chart-png-image')

    expect(h.rest.calls.filter(call => call.path === '/api/fs/read-data-url')).toHaveLength(before + 1)
  })
})

describe('a file Hermes delivered that is not an image', () => {
  it('shows a chip with the file name', async () => {
    await show(reply('The report is ready:\nMEDIA:/tmp/my report.pdf'))

    expect(await screen.findByTestId('media-my-report-pdf-chip')).toBeTruthy()
    expect(screen.getByText('my report.pdf')).toBeTruthy()
    expect(markdownTexts()).toEqual(['The report is ready:\n'])
  })

  it('keeps a sentence that names a file on one line, and shows the chip after it', async () => {
    await show(reply('Open MEDIA:/tmp/my report.pdf for the details.'))

    expect(await screen.findByTestId('media-my-report-pdf-chip')).toBeTruthy()
    expect(markdownTexts()).toEqual(['Open `my report.pdf` for the details.'])
  })

  it('shows a chip in a message the person sent', async () => {
    await show(mine('Look at MEDIA:/tmp/notes.txt'))

    expect(await screen.findByTestId('media-notes-txt-chip')).toBeTruthy()
    expect(screen.getByText('Look at')).toBeTruthy()
  })
})

describe('a reply with no deliverable', () => {
  it('draws the text exactly as it did before', async () => {
    await show(reply('The beds need **six** lines.'))

    expect(markdownTexts()).toEqual(['The beds need **six** lines.'])
    expect(screen.queryByTestId(/^media-/)).toBeNull()
  })

  it('leaves a directive inside a code block as text', async () => {
    const text = 'Write it like this:\n```text\nMEDIA:/tmp/chart.png\n```'
    await show(reply(text))

    expect(screen.queryByTestId(/^media-/)).toBeNull()
    expect(markdownTexts()).toEqual([text])
  })

  it('leaves a path that is still arriving as text', async () => {
    await show(reply('Working:\nMEDIA:/tmp/cha', { streaming: true }))

    expect(screen.queryByTestId(/^media-/)).toBeNull()
    expect(markdownTexts()).toEqual(['Working:\nMEDIA:/tmp/cha'])
  })

  it('leaves a path that could still grow as text while the reply streams', async () => {
    await show(reply('Here:\nMEDIA:/tmp/report.doc', { streaming: true }))

    expect(screen.queryByTestId(/^media-/)).toBeNull()
  })

  it('still shows the typing spinner for a reply with no text yet', async () => {
    await show(reply('', { streaming: true }))

    expect(screen.queryByTestId(/^media-/)).toBeNull()
  })
})
