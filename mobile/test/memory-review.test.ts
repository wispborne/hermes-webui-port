// The memory review store against a fake gateway that answers `/memory` the way
// hermes-agent v0.22.5 does. The parser's own tests are in the web plugin.

import { $appActive } from '@/store/app-state'
import {
  $memoryReview,
  $memoryReviewBusy,
  $memoryReviewReply,
  $pendingMemoryCount,
  keepMemoryCountCurrent,
  reloadMemoryReview,
  runMemoryCommand
} from '@/store/memory-review'

import type { Frame } from './fake-gateway'
import { type Harness, signedInHarness, until } from './harness'

jest.mock('../modules/hermes-background', () => ({ flushCookies: jest.fn(), clearCookies: jest.fn() }))

interface Pending {
  id: string
  summary: string
}

let h: Harness
let approvalOn: boolean
let pending: Pending[]
let args: string[]

function listText() {
  const state = `memory.write_approval = ${approvalOn ? 'on' : 'off'}\n\n`

  if (pending.length === 0) {
    return `${state}No pending memory writes.`
  }

  return [
    `${state}Pending memory writes (${pending.length}):`,
    ...pending.map(write => `  ${write.id}  ${write.summary}`),
    '',
    'Apply: /memory approve <id>   Reject: /memory reject <id>'
  ].join('\n')
}

function answerMemory(arg: string): string {
  const [sub, target] = arg.split(' ')

  if (!sub) {
    return listText()
  }

  if (sub === 'approval') {
    approvalOn = target === 'on'

    return `memory.write_approval set to '${target}'.`
  }

  const known = pending.some(write => write.id === target)

  if (!known) {
    return `No pending memory write with id '${target}'.`
  }

  pending = pending.filter(write => write.id !== target)

  return sub === 'approve' ? 'Approved 1 memory write(s).' : `Rejected pending memory write '${target}'.`
}

beforeEach(async () => {
  approvalOn = true
  pending = [
    { id: 'a1b2c3d4', summary: 'add to memory: Prefers short answers' },
    { id: 'b2c3d4e5', summary: 'add to user profile: Lives in Toronto' }
  ]
  args = []
  h = await signedInHarness()
  h.methods.set('command.dispatch', (frame: Frame) => {
    const params = frame.params as { arg: string; name: string; session_id: string }

    expect(params.name).toBe('memory')
    args.push(params.arg)

    return { type: 'exec', output: answerMemory(params.arg) }
  })
  $appActive.set(true)
})

afterEach(() => h.close())

it('loads the approval setting and the list', async () => {
  await reloadMemoryReview()

  const answer = $memoryReview.get()

  expect(answer?.kind).toBe('review')
  expect(answer?.kind === 'review' && answer.review.approvalOn).toBe(true)
  expect(answer?.kind === 'review' && answer.review.writes.map(write => [write.id, write.target])).toEqual([
    ['a1b2c3d4', 'memory'],
    ['b2c3d4e5', 'user']
  ])
  expect($pendingMemoryCount.get()).toBe(2)
  expect(args).toEqual([''])
})

it('approves one, keeps the reply and reloads', async () => {
  await reloadMemoryReview()
  await runMemoryCommand('approve a1b2c3d4')

  expect(args).toEqual(['', 'approve a1b2c3d4', ''])
  expect($memoryReviewReply.get()).toEqual({ failed: false, text: 'Approved 1 memory write(s).' })
  expect($pendingMemoryCount.get()).toBe(1)
  expect($memoryReviewBusy.get()).toBeNull()
})

it('marks a reply that says nothing happened', async () => {
  await runMemoryCommand('reject 00000000')

  expect($memoryReviewReply.get()).toEqual({ failed: true, text: "No pending memory write with id '00000000'." })
})

it('turns approval off without showing a reply', async () => {
  await runMemoryCommand('approval off')

  expect(args).toEqual(['approval off', ''])
  expect($memoryReviewReply.get()).toBeNull()

  const answer = $memoryReview.get()

  expect(answer?.kind === 'review' && answer.review.approvalOn).toBe(false)
})

it('keeps a reply it cannot read as text', async () => {
  h.methods.set('command.dispatch', () => ({ type: 'exec', output: 'Something new from a later Hermes' }))

  await reloadMemoryReview()

  expect($memoryReview.get()).toEqual({ kind: 'unreadable', text: 'Something new from a later Hermes' })
  expect($pendingMemoryCount.get()).toBe(0)
})

it('keeps the last list while the connection is down and sends nothing', async () => {
  await reloadMemoryReview()
  h.gateway.dropClients()
  await until(() => !h.context.connection.isOpen)

  await runMemoryCommand('approve a1b2c3d4')

  expect($pendingMemoryCount.get()).toBe(2)
  expect(args).toEqual([''])
})

it('reloads the count once a minute while Sessions is on screen', async () => {
  const stop = keepMemoryCountCurrent(h.context, { pollMs: 50 })

  await until(() => $pendingMemoryCount.get() === 2)
  pending = []
  await until(() => $pendingMemoryCount.get() === 0)
  stop()

  const asked = args.length

  await new Promise(resolve => setTimeout(resolve, 150))
  expect(args.length).toBe(asked)
})
