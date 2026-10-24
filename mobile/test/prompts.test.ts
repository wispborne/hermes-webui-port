// Approvals and Questions against a scripted fake gateway.

import { WebSocket as NodeWebSocket } from 'ws'

import { chatStore, openChat } from '@/store/chat'
import {
  answerApproval,
  cancelQuestions,
  promptsFor,
  sendAnswers,
  setAnswer,
  showQuestion
} from '@/store/prompts'
import { $markers } from '@/store/sessions'

import { ChatGateway } from './chat-gateway'
import type { Frame } from './fake-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let h: Harness
let g: ChatGateway
let runtimeId: string
let nextRequest = 1

beforeEach(async () => {
  h = await signedInHarness()
  g = new ChatGateway(h)
  g.addSession('s1', [['user', 'Clean up the build']])
  await openChat('s1')
  runtimeId = chatStore('s1').get().runtimeId!
  // Wait for the second client.capabilities answer.
  await until(() => h.context.connection.declinesNotShown)
})

afterEach(() => h.close())

function serverRequest(method: string, params: Record<string, unknown>): string {
  const id = `req-${nextRequest++}`
  h.gateway.send({ jsonrpc: '2.0', id, method, params: { session_id: runtimeId, ...params } })

  return id
}

const askApproval = (extra: Record<string, unknown> = {}) =>
  serverRequest('approval', {
    request_id: `ap-${nextRequest}`,
    command: 'rm -rf build/',
    description: 'delete a folder',
    choices: ['once', 'session', 'always', 'deny'],
    allow_permanent: true,
    ...extra
  })

const answerTo = (id: string) => h.gateway.clientFrame(frame => frame.id === id && frame.method === undefined)
const approvals = () => promptsFor('s1').approvals

describe('Approvals', () => {
  it('shows an Approval card with the command and the offered choices, and marks Needs input', async () => {
    askApproval()
    await until(() => approvals().length === 1)

    expect(approvals()[0]).toMatchObject({ command: 'rm -rf build/', description: 'delete a folder', choices: ['once', 'session', 'always', 'deny'] })
    expect($markers.get().s1).toBe('needs-input')
  })

  it('hides Always allow when the gateway does not allow it', async () => {
    askApproval({ allow_permanent: false })
    await until(() => approvals().length === 1)

    expect(approvals()[0].choices).toEqual(['once', 'session', 'deny'])
  })

  it.each(['once', 'session', 'always', 'deny'] as const)('answers %s on the live request and removes the card', async choice => {
    const id = askApproval()
    await until(() => approvals().length === 1)

    await answerApproval('s1', approvals()[0], choice)

    expect(await answerTo(id)).toMatchObject({ result: { choice } })
    expect(approvals()).toEqual([])
    expect($markers.get().s1).toBeUndefined()
  })

  it('stacks several Approvals and shows the next after one is answered', async () => {
    askApproval()
    askApproval()
    askApproval()
    await until(() => approvals().length === 3)

    await answerApproval('s1', approvals()[0], 'once')

    expect(approvals()).toHaveLength(2)
  })

  it('answers an Approval found through approval.pending with approval.respond', async () => {
    h.methods.set('approval.pending', () => ({ approvals: [{ request_id: 'ap-restored', command: 'make deploy', choices: ['once', 'deny'] }] }))
    h.methods.set('approval.respond', () => ({ resolved: 1 }))
    askApproval({ request_id: 'ap-gone' })
    await until(() => approvals().length === 1)

    // The turn moved on, so the phone checks which Approvals are still open.
    g.emit('s1', 'tool.start', { tool_id: 't1', name: 'terminal' })
    await until(() => approvals()[0]?.approvalId === 'ap-restored')

    await answerApproval('s1', approvals()[0], 'once')

    expect(await h.gateway.clientFrame(frame => frame.method === 'approval.respond')).toMatchObject({
      params: { session_id: runtimeId, request_id: 'ap-restored', choice: 'once' }
    })
  })
})

describe('Questions', () => {
  const ask = () =>
    serverRequest('clarify', {
      questions: [
        { qid: 'q0', question: 'Which branch?', choices: ['main (recommended)', 'dev'], multi_select: false },
        { qid: 'q1', question: 'Which checks?', choices: ['Unit', 'Lint', 'Types'], multi_select: true },
        { qid: 'q2', question: 'Anything else?', choices: null }
      ]
    })

  it('steps through the questions and sends every answer at once', async () => {
    const id = ask()
    await until(() => promptsFor('s1').question !== null)
    expect($markers.get().s1).toBe('needs-input')

    setAnswer('s1', 'main (recommended)')
    showQuestion('s1', 1)
    setAnswer('s1', ['Unit', 'Types'])
    showQuestion('s1', 2)
    setAnswer('s1', 'Deploy after lunch')
    sendAnswers('s1')

    expect(await answerTo(id)).toMatchObject({
      result: { answers: { q0: 'main (recommended)', q1: ['Unit', 'Types'], q2: 'Deploy after lunch' } }
    })
    expect(promptsFor('s1').question).toBeNull()
  })

  it('sends a skipped question as null', async () => {
    const id = ask()
    await until(() => promptsFor('s1').question !== null)

    setAnswer('s1', null)
    showQuestion('s1', 1)
    setAnswer('s1', ['Lint'])
    sendAnswers('s1')

    expect(await answerTo(id)).toMatchObject({ result: { answers: { q0: null, q1: ['Lint'], q2: null } } })
  })

  it('cancels all the questions with a response that has no answers', async () => {
    const id = ask()
    await until(() => promptsFor('s1').question !== null)

    cancelQuestions('s1')

    expect((await answerTo(id)).result).toEqual({})
  })
})

describe('cards that can no longer be answered', () => {
  it('removes a timed-out Approval and adds the timed-out note', async () => {
    const id = askApproval()
    await until(() => approvals().length === 1)

    g.emit('s1', 'request.cancel', { id, method: 'approval', reason: 'timeout' })
    await until(() => approvals().length === 0)

    expect(chatStore('s1').get().items.at(-1)).toMatchObject({ kind: 'note', text: 'Approval timed out — the command was not run.' })
  })

  it('removes Approvals the gateway dropped', async () => {
    askApproval({ request_id: 'ap-x' })
    await until(() => approvals().length === 1)

    g.emit('s1', 'approval.cancelled', { session_id: 's1', request_ids: ['ap-x'], reason: 'interrupted' })
    await until(() => approvals().length === 0)
  })

  it('removes the cards when the turn is stopped', async () => {
    askApproval()
    await until(() => approvals().length === 1)

    g.emit('s1', 'message.complete', { text: '', status: 'interrupted' })
    await until(() => approvals().length === 0)
  })

  it('removes an Approval answered on the laptop once the turn moves on', async () => {
    h.methods.set('approval.pending', () => ({ approvals: [] }))
    askApproval()
    await until(() => approvals().length === 1)

    g.emit('s1', 'tool.complete', { tool_id: 't1', name: 'terminal', summary: 'done' })
    await until(() => approvals().length === 0)
  })

  it('removes a card a resume no longer lists', async () => {
    askApproval()
    await until(() => approvals().length === 1)

    h.gateway.dropClients()
    await h.context.connection.waitUntilOpen(3000)
    await until(() => approvals().length === 0)
  })
})

describe('requests the app does not show', () => {
  it('declines them with 4404 ("not shown here"), and another device can still answer', async () => {
    // A second client, such as the web UI on a laptop, attached to the same gateway.
    const laptop = new NodeWebSocket(h.gateway.url)
    await new Promise(resolve => laptop.once('open', resolve))
    const laptopSaw = new Promise<Frame>(resolve =>
      laptop.on('message', data => {
        const frame = JSON.parse(String(data)) as Frame

        if (frame.method === 'sudo') resolve(frame)
      })
    )

    const id = serverRequest('sudo', { command: 'sudo apt upgrade' })
    const phoneAnswer = await answerTo(id)

    expect(phoneAnswer).toMatchObject({ error: { code: 4404 } })

    // The gateway counts the phone's decline as one client passing; the laptop still answers.
    const asked = await laptopSaw
    laptop.send(JSON.stringify({ jsonrpc: '2.0', id: asked.id, result: { value: 'hunter2' } }))
    await h.gateway.clientFrame(frame => frame.id === id && (frame.result as { value?: string } | undefined)?.value === 'hunter2')
    laptop.close()
  })

  it('answers -32601 when the gateway does not count declines', async () => {
    h.context.connection.declinesNotShown = false

    const id = serverRequest('secret', { name: 'API_KEY' })

    expect(await answerTo(id)).toMatchObject({ error: { code: -32601 } })
  })
})
