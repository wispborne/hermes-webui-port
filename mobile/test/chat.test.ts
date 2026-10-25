// The chat store against a scripted fake gateway: opening, streaming,
// sending, Stop, the outbox and catching up after a reconnect.

import type { AssistantItem, ChatItem } from '@/chat/items'
import { loadOutbox } from '@/storage/outbox'
import { loadTranscript, markOpened, SAVED_TRANSCRIPT_LIMIT, saveTranscript } from '@/storage/transcripts'
import {
  cancelOutboxMessage,
  chatStore,
  confirmOldOutboxMessage,
  flushDeltas,
  loadEarlier,
  newLocalKey,
  openChat,
  processOutbox,
  sendMessage,
  stopTurn
} from '@/store/chat'
import { $markers } from '@/store/sessions'

import { ChatGateway } from './chat-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let h: Harness
let g: ChatGateway

beforeEach(async () => {
  h = await signedInHarness()
  g = new ChatGateway(h)
})

afterEach(() => h.close())

const items = (key: string) => {
  flushDeltas()

  return chatStore(key).get().items
}

const texts = (list: ChatItem[]) =>
  list.map(item => (item.kind === 'user' || item.kind === 'assistant' ? `${item.kind}: ${item.text}${item.kind === 'user' && item.state ? ` (${item.state})` : ''}` : item.kind))

const goOffline = async () => {
  h.rest.reachable = false
  h.gateway.dropClients()
  await until(() => h.context.connection.$status.get() === 'offline')
}

const comeBack = async () => {
  h.rest.reachable = true
  h.context.connection.retryNow()
  await h.context.connection.waitUntilOpen(3000)
}

describe('opening a session', () => {
  it('shows the saved transcript at once, then the gateway rows', async () => {
    g.addSession('s1', [
      ['user', 'Hi'],
      ['assistant', 'Hello'],
      ['user', 'More?']
    ])
    await saveTranscript(h.db, 's1', { items: [{ kind: 'user', key: 'old', text: 'Saved earlier' }], hasEarlier: false, gatewayRows: 1 })

    const seen: string[][] = []
    const stop = chatStore('s1').listen(state => seen.push([state.transcript, ...texts(state.items)]))
    await openChat('s1')
    stop()

    expect(seen).toContainEqual(['saved', 'user: Saved earlier'])
    expect(texts(items('s1'))).toEqual(['user: Hi', 'assistant: Hello', 'user: More?'])
    expect(chatStore('s1').get()).toMatchObject({ transcript: 'loaded', runtimeId: 'rt-1' })
  })

  it('saves what it loaded, so the session opens offline later', async () => {
    g.addSession('s1', [['user', 'Hi']])
    await openChat('s1')

    expect((await loadTranscript(h.db, 's1'))?.items.map(item => item.kind)).toEqual(['user'])
  })

  it('says the transcript is not saved when it was never opened and the gateway is unreachable', async () => {
    g.addSession('s1', [['user', 'Hi']])
    await goOffline()

    await openChat('s1')

    expect(chatStore('s1').get().transcript).toBe('not-saved')
  })

  it('shows the reply in progress of a running turn and keeps streaming it', async () => {
    g.addSession('s1', [['user', 'Plan the beds']])
    g.emit('s1', 'message.start', {}, false)
    g.emit('s1', 'message.delta', { text: 'You need ' }, false)

    await openChat('s1')
    g.emit('s1', 'message.delta', { text: 'six lines.' })
    await until(() => (items('s1').at(-1) as AssistantItem | undefined)?.text === 'You need six lines.')

    expect(chatStore('s1').get().running).toBe(true)
    expect($markers.get().s1).toBe('running')
  })

  it('loads older rows above with "Show earlier"', async () => {
    g.addSession('s1', Array.from({ length: 130 }, (_, i): ['user', string] => ['user', `m${i}`]))
    await openChat('s1')

    expect(items('s1')).toHaveLength(120)
    expect(chatStore('s1').get().hasEarlier).toBe(true)

    await loadEarlier('s1')

    expect(items('s1')).toHaveLength(130)
    expect(texts(items('s1')).slice(0, 2)).toEqual(['user: m0', 'user: m1'])
    expect(chatStore('s1').get().hasEarlier).toBe(false)
  })
})

describe('the 50 saved transcripts', () => {
  it('drops the transcript of the least recently opened session', async () => {
    for (let i = 0; i <= SAVED_TRANSCRIPT_LIMIT; i++) {
      await saveTranscript(h.db, `s${i}`, { items: [{ kind: 'user', key: 'k', text: `${i}` }], hasEarlier: false, gatewayRows: 1 })
      await markOpened(h.db, `s${i}`, 1000 + i)
    }

    expect(await loadTranscript(h.db, 's0')).toBeNull()
    expect(await loadTranscript(h.db, 's1')).not.toBeNull()
    expect(await loadTranscript(h.db, `s${SAVED_TRANSCRIPT_LIMIT}`)).not.toBeNull()
  })
})

describe('sending', () => {
  beforeEach(async () => {
    g.addSession('s1', [['user', 'Hi']])
    await openChat('s1')
  })

  it('shows the message at once, sends it, and streams the reply', async () => {
    g.onSubmit = live => {
      setTimeout(() => g.reply(live.storedId, 'Hello back'), 10)

      return { status: 'streaming' }
    }

    await sendMessage('s1', 'Hello')
    expect(texts(items('s1')).at(-1)).toMatch(/^user: Hello/)

    await until(() => texts(items('s1')).includes('assistant: Hello back'))
    expect(g.submitted).toEqual([{ storedId: 's1', text: 'Hello' }])
    expect(await loadOutbox(h.db)).toEqual([])
    expect(chatStore('s1').get().running).toBe(false)
  })

  it('shows a message sent during a turn as queued', async () => {
    g.onSubmit = () => ({ status: 'queued' })

    await sendMessage('s1', 'And then?')
    await until(() => g.submitted.length === 1 && texts(items('s1')).includes('user: And then? (queued)'))
  })

  it('stops a running turn', async () => {
    g.emit('s1', 'message.start')
    g.emit('s1', 'message.delta', { text: 'Half' })
    await until(() => chatStore('s1').get().running)

    await stopTurn('s1')
    await until(() => !chatStore('s1').get().running)

    expect(h.gateway.received.some(frame => frame.method === 'session.interrupt')).toBe(true)
    expect(texts(items('s1')).at(-1)).toBe('assistant: Half')
  })

  it('resumes once and retries when the Live session was dropped', async () => {
    g.live.clear()

    await sendMessage('s1', 'Still there?')
    await until(() => g.submitted.length === 1)

    expect(chatStore('s1').get().runtimeId).toBe('rt-2')
  })

  it('keeps a message it could not send, marked as failed, when the session is gone from the gateway', async () => {
    g.live.clear()
    g.rows.delete('s1')

    await sendMessage('s1', 'Anyone?')
    await processOutbox()

    expect(items('s1').at(-1)).toMatchObject({ kind: 'user', text: 'Anyone?', state: 'waiting', sendFailed: true })
    expect((await loadOutbox(h.db)).map(entry => entry.text)).toEqual(['Anyone?'])
  })

  it('creates a new session with its first message', async () => {
    const key = newLocalKey()

    await sendMessage(key, 'Start something')
    await until(() => chatStore(key).get().storedId !== null && g.submitted.length === 1)

    const storedId = chatStore(key).get().storedId!
    expect(storedId).toBe('new-1')
    expect(g.submitted).toEqual([{ storedId: 'new-1', text: 'Start something' }])
    expect(texts(chatStore(storedId).get().items)).toEqual(['user: Start something'])
  })
})

describe('the outbox', () => {
  beforeEach(async () => {
    g.addSession('s1', [['user', 'Hi']])
    await openChat('s1')
    await goOffline()
  })

  it('keeps messages written offline and sends them in order when the gateway is back', async () => {
    await sendMessage('s1', 'first')
    await sendMessage('s1', 'second')

    expect(texts(items('s1')).slice(-2)).toEqual(['user: first (waiting)', 'user: second (waiting)'])
    expect((await loadOutbox(h.db)).map(entry => entry.text)).toEqual(['first', 'second'])

    await comeBack()
    await until(() => g.submitted.length === 2)

    expect(g.submitted.map(sent => sent.text)).toEqual(['first', 'second'])
    expect(await loadOutbox(h.db)).toEqual([])
  })

  it('creates a session started offline when the gateway is back', async () => {
    const key = newLocalKey()
    await sendMessage(key, 'Offline start')

    await comeBack()
    await until(() => g.submitted.length === 1)

    expect(g.submitted).toEqual([{ storedId: 'new-1', text: 'Offline start' }])
  })

  it('never sends a cancelled message', async () => {
    await sendMessage('s1', 'never mind')
    const entry = (await loadOutbox(h.db))[0]

    await cancelOutboxMessage('s1', entry.id)
    await comeBack()
    await processOutbox()

    expect(g.submitted).toEqual([])
    expect(texts(items('s1'))).not.toContain('user: never mind (waiting)')
  })

  it('holds a message older than 24 hours until "Send now"', async () => {
    await sendMessage('s1', 'from yesterday')
    const entry = (await loadOutbox(h.db))[0]
    await h.db.runAsync('UPDATE outbox SET created_at = ? WHERE id = ?', Date.now() / 1000 - 25 * 3600, entry.id)

    await comeBack()
    await processOutbox()

    expect(g.submitted).toEqual([])
    expect(texts(items('s1')).at(-1)).toBe('user: from yesterday (old)')

    confirmOldOutboxMessage('s1', entry.id)
    await until(() => g.submitted.length === 1)
  })

  it('sends a message exactly once when the connection drops before the gateway confirms it', async () => {
    await comeBack()
    // The gateway takes the message, then the connection drops before the answer.
    g.onSubmit = () => {
      setTimeout(() => {
        h.rest.reachable = false
        h.gateway.dropClients()
      }, 5)

      return undefined
    }

    await sendMessage('s1', 'only once')
    await until(() => h.context.connection.$status.get() === 'offline')
    await processOutbox()
    expect((await loadOutbox(h.db))[0]?.state).toBe('uncertain')

    g.onSubmit = () => ({ status: 'streaming' })
    await comeBack()
    await processOutbox()

    expect(g.submitted.map(sent => sent.text)).toEqual(['only once'])
    expect(await loadOutbox(h.db)).toEqual([])
  })
})

describe('catching up after a reconnect', () => {
  beforeEach(async () => {
    g.addSession('s1', [['user', 'Long job please']])
    await openChat('s1')
    g.emit('s1', 'message.start')
    g.emit('s1', 'message.delta', { text: 'Working on ' })
    await until(() => texts(items('s1')).at(-1) === 'assistant: Working on ')
  })

  // The app reconnects after a random wait, which can be close to 0. Then it is
  // back before a check for "not open" runs. goOffline keeps it off until
  // the test has set up what it missed.
  it('replays what happened while disconnected', async () => {
    await goOffline()

    g.emit('s1', 'message.delta', { text: 'it. Done.' }, false)
    g.emit('s1', 'tool.complete', { tool_id: 't1', name: 'terminal', summary: 'ok' }, false)
    g.emit('s1', 'message.complete', { text: 'Finished.', status: 'complete' }, false)

    await comeBack()
    await until(() => !chatStore('s1').get().running)

    expect(items('s1').map(item => item.kind)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(texts(items('s1'))).toEqual(['user: Long job please', 'assistant: Working on it. Done.', 'tool', 'assistant: Finished.'])
  })

  it('reloads the session when the gateway restarted', async () => {
    await goOffline()
    g.restart()
    g.addRow('s1', 'assistant', 'Done before the restart.')

    await comeBack()
    await until(() => texts(items('s1')).includes('assistant: Done before the restart.'))

    expect(chatStore('s1').get().running).toBe(false)
    expect(chatStore('s1').get().runtimeId).toBe('rt-2')
  })
})
