// Pending memories: the Memory review screen's list and the count on Sessions.
// Read from the gateway's `/memory` command through `command.dispatch`, which
// answers it in the gateway process and works without a session. The list is
// the gateway's state, so it's never saved on the phone.
// Follows the web UI's memory review plugin and uses its parser.

import { type MemoryReview, parseApprovalReply, parseMemoryReview, replyFailed } from '@hermes/memory-review/parse'
import { atom, computed } from 'nanostores'

import { $appActive } from './app-state'
import { $gateway, type GatewayContext, onGatewayChange } from './gateway'

export const MEMORY_POLL_MS = 60_000

/** The last `/memory` answer: the parsed list, or the reply text when it couldn't be read. */
export type MemoryReviewAnswer = { kind: 'review'; review: MemoryReview } | { kind: 'unreadable'; text: string }

export interface MemoryReviewReply {
  failed: boolean
  text: string
}

export const $memoryReview = atom<MemoryReviewAnswer | null>(null)
export const $memoryReviewLoading = atom(false)
export const $memoryReviewError = atom<string | null>(null)
/** The gateway's reply to the last approve or reject. Cleared when the next action starts. */
export const $memoryReviewReply = atom<MemoryReviewReply | null>(null)
/** The command running now, such as `approve a1b2c3d4`, or null. */
export const $memoryReviewBusy = atom<string | null>(null)

export const $pendingMemoryCount = computed($memoryReview, answer =>
  answer?.kind === 'review' ? answer.review.writes.length : 0
)

async function dispatchMemory(gateway: GatewayContext, arg: string): Promise<string> {
  const answer = await gateway.connection.client.request<{ output?: string } | null>('command.dispatch', {
    arg,
    name: 'memory',
    session_id: ''
  })

  return answer?.output ?? ''
}

let reloading: Promise<void> | null = null

/** Runs `/memory` and keeps the answer. Needs the WebSocket; does nothing while it's closed. */
export function reloadMemoryReview(gateway: GatewayContext | null = $gateway.get()): Promise<void> {
  if (!gateway?.connection.isOpen) {
    return Promise.resolve()
  }

  reloading ??= (async () => {
    $memoryReviewLoading.set(true)

    try {
      const text = await dispatchMemory(gateway, '')

      if ($gateway.get() !== gateway) {
        return
      }

      const review = parseMemoryReview(text)
      $memoryReview.set(review ? { kind: 'review', review } : { kind: 'unreadable', text })
      $memoryReviewError.set(null)
    } catch (error) {
      if ($gateway.get() === gateway) {
        $memoryReviewError.set(error instanceof Error ? error.message : String(error))
      }
    } finally {
      $memoryReviewLoading.set(false)
      reloading = null
    }
  })()

  return reloading
}

/**
 * Runs `approve <id>`, `reject <id>`, `approve all`, `reject all` or
 * `approval on|off`, keeps the reply, then reloads the list. A changed
 * approval setting shows no reply unless it failed.
 */
export async function runMemoryCommand(arg: string, gateway: GatewayContext | null = $gateway.get()): Promise<void> {
  if (!gateway?.connection.isOpen || $memoryReviewBusy.get()) {
    return
  }

  $memoryReviewBusy.set(arg)
  $memoryReviewReply.set(null)

  try {
    const text = await dispatchMemory(gateway, arg)

    if (arg.startsWith('approval ')) {
      if (parseApprovalReply(text) === null) {
        $memoryReviewReply.set({ failed: true, text })
      }
    } else {
      $memoryReviewReply.set({ failed: replyFailed(text), text })
    }
  } catch (error) {
    $memoryReviewReply.set({ failed: true, text: error instanceof Error ? error.message : String(error) })
  } finally {
    await reloadMemoryReview(gateway)
    $memoryReviewBusy.set(null)
  }
}

export function dismissMemoryReviewReply() {
  $memoryReviewReply.set(null)
}

/**
 * Keeps the count current while a screen that shows it is focused: reloads
 * now, on every reconnect, and once a minute while the app is on screen and
 * connected. Returns a function that stops it.
 */
export function keepMemoryCountCurrent(gateway: GatewayContext, { pollMs = MEMORY_POLL_MS } = {}): () => void {
  const { connection } = gateway
  let poll: ReturnType<typeof setInterval> | null = null

  const updatePolling = () => {
    const shouldPoll = $appActive.get() && connection.isOpen

    if (shouldPoll && !poll) {
      poll = setInterval(() => void reloadMemoryReview(gateway), pollMs)
    } else if (!shouldPoll && poll) {
      clearInterval(poll)
      poll = null
    }
  }

  const stopStatus = connection.$status.listen(status => {
    updatePolling()

    if (status === 'open') {
      void reloadMemoryReview(gateway)
    }
  })

  const stopActive = $appActive.listen(updatePolling)

  updatePolling()
  void reloadMemoryReview(gateway)

  return () => {
    stopStatus()
    stopActive()

    if (poll) {
      clearInterval(poll)
    }
  }
}

function reset() {
  $memoryReview.set(null)
  $memoryReviewLoading.set(false)
  $memoryReviewError.set(null)
  $memoryReviewReply.set(null)
  $memoryReviewBusy.set(null)
  reloading = null
}

onGatewayChange(reset)
