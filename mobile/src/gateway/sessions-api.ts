// The gateway calls behind the Sessions screen.

import type { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'

import type { GatewayRest } from './rest'

/** One saved session, as the Sessions screen shows it. Times are Unix seconds. */
export interface SessionRow {
  id: string
  title: string | null
  preview: string | null
  startedAt: number
  lastActive: number
  messageCount: number
  source: string | null
}

/** What a row shows about the session's live state. */
export type SessionMarker = 'running' | 'needs-input'

export const SESSION_PAGE_SIZE = 40

interface GatewaySessionRow {
  id: string
  title?: string | null
  preview?: string | null
  started_at?: number | null
  last_active?: number | null
  message_count?: number | null
  source?: string | null
  hidden?: boolean | null
}

export interface SessionPage {
  rows: SessionRow[]
  /** True when the gateway has more sessions after this page. */
  hasMore: boolean
}

const toRow = (row: GatewaySessionRow): SessionRow => ({
  id: row.id,
  title: row.title?.trim() || null,
  preview: row.preview?.trim() || null,
  startedAt: row.started_at ?? 0,
  lastActive: row.last_active ?? row.started_at ?? 0,
  messageCount: row.message_count ?? 0,
  source: row.source ?? null
})

/**
 * One page of the default profile's sessions, most recently active first.
 * Cron and archived sessions are left out by the gateway, and hidden ones
 * here, as on the desktop.
 */
export async function loadSessionPage(rest: GatewayRest, offset = 0): Promise<SessionPage> {
  const answer = await rest.get<{ sessions?: GatewaySessionRow[]; total?: number } | null>('/api/profiles/sessions', {
    limit: SESSION_PAGE_SIZE,
    offset,
    min_messages: 0,
    archived: 'exclude',
    order: 'recent',
    profile: 'default',
    exclude_sources: 'cron'
  })
  const raw = answer?.sessions ?? []
  const rows = raw.filter(row => row.hidden !== true && row.source !== 'cron').map(toRow)
  const total = answer?.total

  return { rows, hasMore: typeof total === 'number' ? offset + raw.length < total : raw.length >= SESSION_PAGE_SIZE }
}

interface SearchHit {
  session_id: string
  title?: string | null
  snippet?: string | null
  last_active?: number | null
  session_started?: number | null
  source?: string | null
}

/** The gateway's search over saved sessions. One row per session, best match first. */
export async function searchSessions(rest: GatewayRest, query: string): Promise<SessionRow[]> {
  const answer = await rest.get<{ results?: SearchHit[] } | null>('/api/sessions/search', { q: query })
  const seen = new Set<string>()
  const rows: SessionRow[] = []

  for (const hit of answer?.results ?? []) {
    if (seen.has(hit.session_id) || hit.source === 'cron') {
      continue
    }

    seen.add(hit.session_id)
    rows.push({
      id: hit.session_id,
      title: hit.title?.trim() || null,
      preview: hit.snippet?.trim() || null,
      startedAt: hit.session_started ?? 0,
      lastActive: hit.last_active ?? hit.session_started ?? 0,
      messageCount: 0,
      source: hit.source ?? null
    })
  }

  return rows
}

/**
 * The marker for a live session's status (`tui_gateway/session_registry.py`).
 * `waiting` means an Approval or Question is waiting.
 */
export function markerForStatus(status: string | null | undefined): SessionMarker | null {
  switch (status) {
    case 'working':
    case 'streaming':
    case 'starting':
    case 'resuming':
      return 'running'
    case 'waiting':
      return 'needs-input'
    default:
      return null
  }
}

/** Markers for every live session on the gateway, by stored id. Includes sessions open on other devices. */
export async function loadMarkers(client: JsonRpcGatewayClient): Promise<Record<string, SessionMarker>> {
  const answer = await client.request<{ sessions?: { session_key?: string; status?: string }[] } | null>(
    'session.active_list',
    {},
    15_000
  )
  const markers: Record<string, SessionMarker> = {}

  for (const session of answer?.sessions ?? []) {
    const marker = markerForStatus(session.status)

    if (session.session_key && marker) {
      markers[session.session_key] = marker
    }
  }

  return markers
}
