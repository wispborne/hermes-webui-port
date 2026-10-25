import type { ApprovalCard, QuestionCard, SessionPrompts } from '@/store/prompts'

import { type NotificationContent, type NotificationContext, Notifications } from './notifications'

const approval = (approvalId: string): ApprovalCard => ({
  requestId: `req-${approvalId}`,
  approvalId,
  command: 'rm -rf build/',
  description: 'delete a folder',
  choices: ['once', 'session', 'always', 'deny'],
  pattern: 'rm -rf build/',
  arrivedAt: 0
})

const question: QuestionCard = {
  requestId: 'req-q',
  questions: [{ qid: 'q0', question: 'Which branch?' }],
  answers: {},
  index: 0,
  arrivedAt: 0
}

const prompts = (approvals: ApprovalCard[], q: QuestionCard | null = null): SessionPrompts => ({ approvals, question: q })

function setup() {
  const shown = new Map<string, NotificationContent>()
  const notifications = new Notifications({
    show: (id, content) => void shown.set(id, content),
    dismiss: id => void shown.delete(id)
  })

  return { notifications, shown }
}

const offScreen: NotificationContext = { appActive: false, onScreen: 's1', storedId: 's1', title: 'Docker cache' }

describe('notifications', () => {
  it('raises "Approval needed" with Run and Reject while the app is off screen', () => {
    const { notifications, shown } = setup()

    notifications.promptsChanged('s1', prompts([approval('a1')]), offScreen)

    expect([...shown.entries()]).toEqual([
      [
        'approval:a1',
        expect.objectContaining({
          title: 'Approval needed — Docker cache',
          body: 'rm -rf build/',
          approvalActions: true,
          url: 'hermes://session/s1'
        })
      ]
    ])
  })

  it('removes the notification when the card is removed', () => {
    const { notifications, shown } = setup()
    notifications.promptsChanged('s1', prompts([approval('a1')]), offScreen)

    notifications.promptsChanged('s1', prompts([]), offScreen)

    expect(shown.size).toBe(0)
  })

  it('moves to the next Approval of a stack', () => {
    const { notifications, shown } = setup()
    notifications.promptsChanged('s1', prompts([approval('a1'), approval('a2')]), offScreen)

    notifications.promptsChanged('s1', prompts([approval('a2')]), offScreen)

    expect([...shown.keys()]).toEqual(['approval:a2'])
  })

  it('raises the notification once the app leaves the screen showing that session', () => {
    const { notifications, shown } = setup()
    notifications.promptsChanged('s1', prompts([approval('a1')]), { ...offScreen, appActive: true })
    expect(shown.size).toBe(0)

    notifications.promptsChanged('s1', prompts([approval('a1')]), offScreen)

    expect(shown.get('approval:a1')).toMatchObject({ approvalActions: true })
  })

  it('raises "Input needed" with the first question', () => {
    const { notifications, shown } = setup()

    notifications.promptsChanged('s1', prompts([], question), offScreen)

    expect(shown.get('question:req-q')).toMatchObject({ title: 'Input needed — Docker cache', body: 'Which branch?' })
  })

  it('raises nothing for the session on screen', () => {
    const { notifications, shown } = setup()

    notifications.promptsChanged('s1', prompts([approval('a1')], question), { ...offScreen, appActive: true })
    notifications.turnEnded('s1', false, { ...offScreen, appActive: true })

    expect(shown.size).toBe(0)
  })

  it('raises "Hermes finished" when a turn ends off screen, and "Turn failed" for a failed one', () => {
    const { notifications, shown } = setup()

    notifications.turnEnded('s1', false, offScreen)
    expect(shown.get('finished:s1')).toMatchObject({ title: 'Hermes finished' })

    notifications.turnEnded('s1', true, offScreen)
    expect(shown.get('finished:s1')).toMatchObject({ title: 'Turn failed' })
  })
})

describe('sessions the phone is only watching', () => {
  it('shows "Input needed" without buttons, which opens the session', () => {
    const { notifications, shown } = setup()

    notifications.sessionWaiting('laptop-1', 'Plan the garden')

    expect(shown.get('waiting:laptop-1')).toEqual({
      title: 'Input needed — Plan the garden',
      body: 'Hermes is waiting for your response.',
      channel: 'needs-input',
      url: 'hermes://session/laptop-1',
      data: { url: 'hermes://session/laptop-1' }
    })
  })

  it('uses the plain title when the session has none', () => {
    const { notifications, shown } = setup()

    notifications.sessionWaiting('laptop-1', null)

    expect(shown.get('waiting:laptop-1')?.title).toBe('Input needed')
  })

  it('removes it when the session stops waiting, or is opened', () => {
    const { notifications, shown } = setup()

    notifications.sessionWaiting('a', 'A')
    notifications.sessionWaiting('b', 'B')
    notifications.sessionStoppedWaiting('a')
    notifications.sessionOpened('b')

    expect([...shown.keys()]).toEqual([])
  })
})
