/**
 * Runs `/memory` on the gateway through `command.dispatch`, which answers it
 * in the gateway process. `slash.exec` would start the session's slash worker,
 * a whole CLI process, which is too heavy for the status bar's polling.
 */

import { atom, host } from '@hermes/plugin-sdk'

import { type MemoryReview, parseMemoryReview } from './parse'

/** The last session that had focus. Pending writes belong to a profile, and
 *  the gateway reads the profile from this session; with none it uses its
 *  own. Kept after focus clears, since the page is a route of its own. */
export const $reviewSessionId = atom<null | string>(null)

export function trackReviewSession(): () => void {
  return host.state.focusedSessionId.subscribe(id => {
    if (id) {
      $reviewSessionId.set(id)
    }
  })
}

export const reviewKey = (sessionId: null | string) => ['memory-review', sessionId] as const

export type ReviewResult = { kind: 'review'; review: MemoryReview } | { kind: 'unreadable'; text: string }

interface DispatchReply {
  output?: string
  type?: string
}

export async function runMemoryCommand(sessionId: null | string, arg = ''): Promise<string> {
  const reply = await host.request<DispatchReply>('command.dispatch', {
    arg,
    name: 'memory',
    session_id: sessionId ?? ''
  })

  return reply?.output ?? ''
}

export async function fetchReview(sessionId: null | string): Promise<ReviewResult> {
  const text = await runMemoryCommand(sessionId)
  const review = parseMemoryReview(text)

  return review ? { kind: 'review', review } : { kind: 'unreadable', text }
}
