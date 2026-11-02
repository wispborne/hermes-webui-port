// Slash commands against the fake gateway: what runs on the phone, what goes
// to slash.exec or command.dispatch, and what each answer does.

import type { NoteItem, UserItem } from '@/chat/items'
import { chatStore, flushDeltas, openChat } from '@/store/chat'
import { runSlashCommand, suggestCommands } from '@/store/slash'

import { ChatGateway } from './chat-gateway'
import { rpcError } from './fake-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let h: Harness
let g: ChatGateway
const asked: { method: string; params: Record<string, unknown> }[] = []

beforeEach(async () => {
  h = await signedInHarness()
  g = new ChatGateway(h)
  asked.length = 0
  g.addSession('s1', [['user', 'Hi'], ['assistant', 'Hello']])
  await openChat('s1')
})

afterEach(() => h.close())

const last = () => {
  flushDeltas()

  return chatStore('s1').get().items.at(-1)
}

/** Answers `method` with `answer`, or refuses it when `answer` is an Error. */
function answerWith(method: string, answer: unknown) {
  h.methods.set(method, frame => {
    asked.push({ method, params: frame.params as Record<string, unknown> })

    if (answer instanceof Error) {
      h.gateway.send(rpcError(frame, 4018, answer.message))

      return undefined
    }

    return answer
  })
}

describe('slash commands', () => {
  it('does /new, /model with no model, and /stop on the phone', async () => {
    await expect(runSlashCommand('s1', '/new')).resolves.toEqual({ kind: 'new-session' })
    await expect(runSlashCommand('s1', '/clear')).resolves.toEqual({ kind: 'new-session' })
    await expect(runSlashCommand('s1', '/model')).resolves.toEqual({ kind: 'pick-model' })
    expect(asked).toEqual([])
  })

  it("shows slash.exec's output as a note under the command", async () => {
    answerWith('slash.exec', { output: 'Session s1', warning: 'Old gateway' })

    await runSlashCommand('s1', '/status now')

    expect(asked).toEqual([{ method: 'slash.exec', params: expect.objectContaining({ session_id: 'rt-1', command: 'status now' }) }])
    expect(last()).toMatchObject({ kind: 'note', command: '/status', text: 'warning: Old gateway\nSession s1' } satisfies Partial<NoteItem>)
  })

  it('falls back to command.dispatch when slash.exec refuses', async () => {
    answerWith('slash.exec', new Error('not a slash command'))
    answerWith('command.dispatch', { type: 'exec', output: 'Done.' })

    await runSlashCommand('s1', '/plugin-thing go')

    expect(asked.map(call => call.method)).toEqual(['slash.exec', 'command.dispatch'])
    expect(asked[1].params).toMatchObject({ name: 'plugin-thing', arg: 'go', session_id: 'rt-1' })
    expect(last()).toMatchObject({ kind: 'note', command: '/plugin-thing', text: 'Done.' })
  })

  it("says why, in slash.exec's words, when neither knows the command", async () => {
    answerWith('slash.exec', new Error('unknown command: /nope'))
    answerWith('command.dispatch', new Error('not a quick/plugin/skill command: nope'))

    await runSlashCommand('s1', '/nope')

    expect(last()).toMatchObject({ kind: 'note', tone: 'error', command: '/nope', text: 'unknown command: /nope' })
  })

  it('sends a skill, showing the command instead of its instructions', async () => {
    answerWith('slash.exec', { type: 'skill', name: 'work', display: '/work fix the leak', message: 'Skill instructions. Task: fix the leak' })

    await runSlashCommand('s1', '/work fix the leak')
    await until(() => g.submitted.length === 1)

    expect(g.submitted[0].text).toBe('Skill instructions. Task: fix the leak')
    expect(chatStore('s1').get().items.findLast(item => item.kind === 'user')).toMatchObject({
      text: '/work fix the leak',
      sentText: 'Skill instructions. Task: fix the leak'
    } satisfies Partial<UserItem>)
  })

  it('runs the target of an alias', async () => {
    h.methods.set('slash.exec', frame => {
      const params = frame.params as Record<string, unknown>
      asked.push({ method: 'slash.exec', params })

      return params.command === 'st' ? { type: 'alias', target: 'status' } : { output: 'Session s1' }
    })

    await runSlashCommand('s1', '/st')

    expect(asked.map(call => call.params.command)).toEqual(['st', 'status'])
  })

  it('hands back a prefill for the message box, with its notice as a note', async () => {
    answerWith('slash.exec', { type: 'prefill', message: 'Hi', notice: 'Removed the last turn.' })

    await expect(runSlashCommand('s1', '/undo')).resolves.toEqual({ kind: 'prefill', text: 'Hi' })
    expect(last()).toMatchObject({ kind: 'note', text: 'Removed the last turn.' })
  })

  it("suggests commands from complete.slash, and completes an argument from replace_from", async () => {
    answerWith('complete.slash', { items: [{ text: '/help', display: '/help', meta: 'List commands' }], replace_from: 0 })

    await expect(suggestCommands('s1', '/he')).resolves.toEqual([{ text: '/help ', label: '/help', description: 'List commands' }])
    expect(asked[0].params).toEqual({ text: '/he', session_id: 'rt-1' })

    answerWith('complete.slash', { items: [{ text: 'alice', meta: '' }], replace_from: 13 })

    await expect(suggestCommands('s1', '/personality al')).resolves.toEqual([{ text: '/personality alice ', label: 'alice', description: '' }])
  })
})
