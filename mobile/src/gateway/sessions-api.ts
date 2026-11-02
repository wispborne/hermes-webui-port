// The gateway calls behind the Sessions screen.

import type { JsonRpcGatewayClient } from '@hermes/shared/json-rpc-gateway'
import {
  createSessionMutationClient,
  type SessionMutationIdentity,
  type SessionMutationSnapshot
} from '@hermes/shared/session-http-mutations'

import { GatewayHttpError, type GatewayRest } from './rest'

/** One saved session, as the Sessions screen shows it. Times are Unix seconds. */
export interface SessionRow {
  id: string
  title: string | null
  preview: string | null
  startedAt: number
  lastActive: number
  messageCount: number
  source: string | null
  pinned: boolean
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
  pinned?: boolean | null
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
  source: row.source ?? null,
  pinned: row.pinned === true
})

/**
 * One page of the default profile's sessions, most recently active first.
 * Cron sessions are left out by the gateway, and hidden ones here, as on the
 * desktop. Archived sessions are left out, or are the only ones with
 * `archived: 'only'`.
 */
export async function loadSessionPage(rest: GatewayRest, offset = 0, archived: 'exclude' | 'only' = 'exclude'): Promise<SessionPage> {
  const answer = await rest.get<{ sessions?: GatewaySessionRow[]; total?: number } | null>('/api/profiles/sessions', {
    limit: SESSION_PAGE_SIZE,
    offset,
    min_messages: 0,
    archived,
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
      source: hit.source ?? null,
      pinned: false
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

// ------------------------------------------------------------ editing

const mutate = createSessionMutationClient()

/** The gateway has no `mutation-snapshot` route. Older gateways take edits without a revision. */
class NoSnapshotRoute extends Error {}

/**
 * Sends an edit to a session the way the desktop does: reads the session's
 * revision from its snapshot, then sends the edit with it, so the gateway
 * refuses it if the session changed in between.
 */
async function editSession<T>(rest: GatewayRest, id: string, method: 'PATCH' | 'DELETE', payload: Record<string, unknown>): Promise<T> {
  const path = `/api/sessions/${encodeURIComponent(id)}`
  const send = (identity: Partial<SessionMutationIdentity>) =>
    method === 'DELETE' ? rest.request<T>(path, { method, query: identity }) : rest.request<T>(path, { method, body: { ...payload, ...identity } })
  const read = () =>
    rest.get<SessionMutationSnapshot>(`${path}/mutation-snapshot`).catch((error: unknown) => {
      throw error instanceof GatewayHttpError && error.status === 404 ? new NoSnapshotRoute() : error
    })

  try {
    return await mutate(JSON.stringify([rest.baseUrl, id, method, payload]), read, send)
  } catch (error) {
    if (error instanceof NoSnapshotRoute) {
      return send({})
    }

    throw error
  }
}

/** Renames a session. An empty title clears it. */
export function renameSessionOnGateway(rest: GatewayRest, id: string, title: string) {
  return editSession<unknown>(rest, id, 'PATCH', { title })
}

export function setSessionPinnedOnGateway(rest: GatewayRest, id: string, pinned: boolean) {
  return editSession<unknown>(rest, id, 'PATCH', { pinned })
}

/** Archiving also unpins, as on the desktop. */
export function setSessionArchivedOnGateway(rest: GatewayRest, id: string, archived: boolean) {
  return editSession<unknown>(rest, id, 'PATCH', { archived, ...(archived ? { pinned: false } : {}) })
}

export function deleteSessionOnGateway(rest: GatewayRest, id: string) {
  return editSession<unknown>(rest, id, 'DELETE', {})
}
