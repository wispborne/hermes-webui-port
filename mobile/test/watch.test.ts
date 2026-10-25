// Watching a session the phone hasn't opened: attaching to it without its
// transcript, its waiting request as a card, and detaching again.

import { WebSocket as NodeWebSocket } from 'ws'

import { $canDetach, chatStore, detachChat, isWatched, openChat, watchChat } from '@/store/chat'
import { promptsFor } from '@/store/prompts'
import { $localMarkers } from '@/store/sessions'

import { ChatGateway } from './chat-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

let h: Harness
let g: ChatGateway

/**
 * The gateway's `session.resume`, with a waiting Approval, and a subscription
 * when `subscriptions` is on. Like the real gateway, it only lists the
 * Approval in `open_requests`; it doesn't send the request frame again.
 */
function resumeWithApproval({ subscriptions }: { subscriptions: boolean }) {
  h.methods.set('session.resume', frame => {
    const storedId = (frame.params as { session_id: string }).session_id
    const live = g.liveFor(storedId)
    const approval = {
      session_id: live.runtimeId,
      request_id: 'ap-1',
      command: 'rm -rf build/',
      description: 'delete a folder',
      choices: ['once', 'session', 'always', 'deny']
    }


    return {
      session_id: live.runtimeId,
      stored_session_id: storedId,
      running: true,
      messages: [],
      info: { title: 'Laptop session' },
      subscription_id: subscriptions ? `sub-${storedId}` : undefined,
      open_requests: [{ id: 'req-1', method: 'approval', params: approval }]
    }
  })
}

const sent = (method: string) => h.gateway.received.filter(frame => frame.method === method)

beforeEach(async () => {
  h = await signedInHarness()
  g = new ChatGateway(h)
  g.addSession('laptop', [['user', 'Clean up the build']])
  h.methods.set('session.detach', frame => ({ ...(frame.params as object), detached: true }))
  await until(() => h.context.connection.declinesNotShown)
})

afterEach(() => h.close())

describe('watching a session', () => {
  it('attaches without loading the transcript and shows the waiting Approval as a card', async () => {
    resumeWithApproval({ subscriptions: true })

    await watchChat('laptop')
    await until(() => promptsFor('laptop').approvals.length > 0)

    expect(isWatched('laptop')).toBe(true)
    expect(promptsFor('laptop').approvals.map(card => card.command)).toEqual(['rm -rf build/'])
    expect(chatStore('laptop').get().transcript).toBe('loading')
    expect(chatStore('laptop').get().title).toBe('Laptop session')
    expect(h.rest.calls.some(call => call.path.includes('/messages'))).toBe(false)
    expect($canDetach.get()).toBe(true)
    // Attached, so the watch skips it.
    expect('laptop' in $localMarkers.get()).toBe(true)
    // Not declined as "not shown here", which could settle the request.
    expect(h.gateway.received.filter(frame => frame.id === 'req-1')).toEqual([])
  })

  it('shows the waiting request when the session is opened normally, too', async () => {
    resumeWithApproval({ subscriptions: false })

    await openChat('laptop')
    await until(() => promptsFor('laptop').approvals.length > 0)

    expect(h.gateway.received.filter(frame => frame.id === 'req-1')).toEqual([])
  })

  it('detaches with its subscription, and never closes the session', async () => {
    resumeWithApproval({ subscriptions: true })
    await watchChat('laptop')
    const runtimeId = chatStore('laptop').get().runtimeId

    await detachChat('laptop')

    expect(sent('session.detach').map(frame => frame.params)).toEqual([{ session_id: runtimeId, subscription_id: 'sub-laptop' }])
    expect(sent('session.close')).toEqual([])
    expect(isWatched('laptop')).toBe(false)
    expect('laptop' in $localMarkers.get()).toBe(false)
  })

  it("stays attached when the gateway gives no subscription, and sends nothing", async () => {
    resumeWithApproval({ subscriptions: false })
    await watchChat('laptop')

    await detachChat('laptop')

    expect($canDetach.get()).toBe(false)
    expect(sent('session.detach')).toEqual([])
    expect(sent('session.close')).toEqual([])
    expect(isWatched('laptop')).toBe(true)
  })

  it('becomes an ordinary open session when the person opens it', async () => {
    resumeWithApproval({ subscriptions: true })
    await watchChat('laptop')

    await openChat('laptop')
    await detachChat('laptop')

    expect(isWatched('laptop')).toBe(false)
    expect(chatStore('laptop').get().transcript).toBe('loaded')
    expect(sent('session.detach')).toEqual([])
  })

  it('does nothing for a session that is already open', async () => {
    resumeWithApproval({ subscriptions: true })
    await openChat('laptop')
    const resumes = sent('session.resume').length

    await watchChat('laptop')

    expect(isWatched('laptop')).toBe(false)
    expect(sent('session.resume').length).toBe(resumes)
  })
})

// Keeps the WebSocket import, which the harness needs in Node.
void NodeWebSocket
