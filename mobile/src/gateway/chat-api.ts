// The gateway calls behind the Session screen. See GATEWAY_PROTOCOL.md,
// sections 6 and 7, and apps/desktop/src/api/sessions.ts for the paging.

import type { TranscriptRow } from '@/chat/items'

import type { GatewayRest } from './rest'

/** As many rows as the desktop loads when it opens a session (`LATEST_SESSION_MESSAGES_LIMIT`). */
export const TRANSCRIPT_PAGE_SIZE = 120

/** The desktop waits this long for `prompt.submit` to be confirmed (`PROMPT_SUBMIT_REQUEST_TIMEOUT_MS`). */
export const PROMPT_SUBMIT_TIMEOUT_MS = 30 * 60_000

export interface TranscriptPage {
  rows: TranscriptRow[]
  /** True when the gateway has older rows than these. */
  hasEarlier: boolean
}

/**
 * The newest rows of a saved session (`offset` 0), or the page just before
 * the `offset` newest rows. Rows come back oldest first.
 */
export async function loadTranscriptPage(rest: GatewayRest, storedId: string, offset = 0): Promise<TranscriptPage> {
  const answer = await rest.get<{ messages?: TranscriptRow[]; pagination?: { limit?: number; order?: string } } | null>(
    `/api/sessions/${encodeURIComponent(storedId)}/messages`,
    { limit: TRANSCRIPT_PAGE_SIZE, offset, order: 'latest', include_compacted: true }
  )
  const rows = answer?.messages ?? []

  // A gateway without paging returns the whole transcript and no `order`.
  const paged = answer?.pagination?.order === 'latest'

  return { rows, hasEarlier: paged && rows.length >= TRANSCRIPT_PAGE_SIZE }
}

export interface ResumeAnswer {
  session_id: string
  stored_session_id?: string | null
  running?: boolean | null
  inflight?: { user?: string; assistant?: string } | null
  info?: { title?: string | null } | null
  open_requests?: { id: string; method: string; params: Record<string, unknown> }[] | null
  /**
   * This connection's subscription to the session. Only gateways with a
   * session authority give one, and only they accept `session.detach`.
   */
  subscription_id?: string | null
}

export interface CreateAnswer {
  session_id: string
  stored_session_id: string
}

export interface SubmitAnswer {
  status?: 'streaming' | 'queued' | 'steered' | 'redirected' | null
}
