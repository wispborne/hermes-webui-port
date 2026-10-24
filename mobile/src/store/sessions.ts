// The Sessions screen's data: the saved list first, then the gateway's, plus
// Running and Needs input markers kept apart from the rows (they're never saved).
// Modelled on the desktop's session list stores, trimmed to one profile.

import { atom, computed, type ReadableAtom } from 'nanostores'

import { isUnreachableError } from '@/gateway/rest'
import {
  loadMarkers,
  loadSessionPage,
  type SessionMarker,
  type SessionRow,
  searchSessions
} from '@/gateway/sessions-api'
import { loadSavedRows, saveFirstPage, saveNextPage, searchSavedRows } from '@/storage/session-rows'

import { $appActive } from './app-state'
import { $gateway, type GatewayContext, onGatewayChange } from './gateway'

export const $sessionRows = atom<SessionRow[]>([])
export const $hasMoreSessions = atom(false)
export const $sessionsLoading = atom(false)

/** Markers from `session.active_list`, by stored id. */
export const $remoteMarkers = atom<Record<string, SessionMarker>>({})

/**
 * Markers for sessions open on this phone, by stored id, set straight from
 * their own events so they change at once. They win over the polled ones.
 */
export const $localMarkers = atom<Record<string, SessionMarker | null>>({})

export const $markers: ReadableAtom<Record<string, SessionMarker>> = computed(
  [$remoteMarkers, $localMarkers],
  (remote, local) => {
    const merged: Record<string, SessionMarker> = { ...remote }

    for (const [id, marker] of Object.entries(local)) {
      if (marker) {
        merged[id] = marker
      } else {
        delete merged[id]
      }
    }

    return merged
  }
)

export function setLocalMarker(storedId: string, marker: SessionMarker | null) {
  $localMarkers.set({ ...$localMarkers.get(), [storedId]: marker })
}

/** Forgets the markers for sessions this phone no longer shows. */
export function clearLocalMarker(storedId: string) {
  const { [storedId]: _, ...rest } = $localMarkers.get()
  $localMarkers.set(rest)
}

function reset() {
  $sessionRows.set([])
  $hasMoreSessions.set(false)
  $remoteMarkers.set({})
  $localMarkers.set({})
}

/** Shows the saved list at once. */
export async function showSavedSessions(gateway: GatewayContext) {
  const rows = await loadSavedRows(gateway.db)

  // The gateway's list may have arrived first.
  if ($gateway.get() === gateway && $sessionRows.get().length === 0) {
    $sessionRows.set(rows)
  }
}

let reloading: Promise<void> | null = null

/** Replaces the list with the gateway's first page, and saves it. Keeps the saved list when offline. */
export function reloadSessions(gateway: GatewayContext | null = $gateway.get()): Promise<void> {
  if (!gateway) {
    return Promise.resolve()
  }

  reloading ??= (async () => {
    $sessionsLoading.set(true)

    try {
      const page = await loadSessionPage(gateway.rest)

      if ($gateway.get() !== gateway) {
        return
      }

      $sessionRows.set(page.rows)
      $hasMoreSessions.set(page.hasMore)
      await saveFirstPage(gateway.db, page.rows)
    } catch (error) {
      if (!isUnreachableError(error)) {
        console.warn('Could not load sessions', error)
      }
    } finally {
      $sessionsLoading.set(false)
      reloading = null
    }
  })()

  return reloading
}

let loadingMore = false

/** Loads the next page below the rows shown. */
export async function loadMoreSessions(gateway: GatewayContext | null = $gateway.get()) {
  if (!gateway || loadingMore || !$hasMoreSessions.get()) {
    return
  }

  loadingMore = true

  try {
    const shown = $sessionRows.get()
    const page = await loadSessionPage(gateway.rest, shown.length)

    if ($gateway.get() !== gateway) {
      return
    }

    const known = new Set(shown.map(row => row.id))
    const added = page.rows.filter(row => !known.has(row.id))

    $sessionRows.set([...shown, ...added])
    $hasMoreSessions.set(page.hasMore && page.rows.length > 0)
    await saveNextPage(gateway.db, added, shown.length)
  } catch (error) {
    if (!isUnreachableError(error)) {
      console.warn('Could not load more sessions', error)
    }
  } finally {
    loadingMore = false
  }
}

/** Reloads the Running and Needs input markers. Needs the WebSocket. */
export async function reloadMarkers(gateway: GatewayContext | null = $gateway.get()) {
  if (!gateway?.connection.isOpen) {
    return
  }

  try {
    const markers = await loadMarkers(gateway.connection.client)

    if ($gateway.get() === gateway) {
      $remoteMarkers.set(markers)
    }
  } catch {
    // The next poll tries again.
  }
}

export type SearchResult = { rows: SessionRow[]; savedOnly: boolean }

/** The gateway's search while connected, else a search of the saved titles and previews. */
export async function searchForSessions(query: string, gateway: GatewayContext | null = $gateway.get()): Promise<SearchResult> {
  if (!gateway) {
    return { rows: [], savedOnly: true }
  }

  if (gateway.connection.$status.get() !== 'offline') {
    try {
      return { rows: await searchSessions(gateway.rest, query), savedOnly: false }
    } catch (error) {
      if (!isUnreachableError(error)) {
        throw error
      }
    }
  }

  return { rows: await searchSavedRows(gateway.db, query), savedOnly: true }
}

export const SESSIONS_CHANGED_DEBOUNCE_MS = 2_000
export const MARKER_POLL_MS = 10_000

/**
 * Keeps the list current while the Sessions screen is open:
 * - `sessions.changed` reloads the list, at most once every 2 seconds
 * - markers are polled every 10 seconds while the app is on screen and connected,
 *   because the gateway sends no event when another device starts a turn
 * - the list and markers reload when the connection opens
 *
 * Returns a function that stops it.
 */
export function keepSessionsCurrent(
  gateway: GatewayContext,
  { debounceMs = SESSIONS_CHANGED_DEBOUNCE_MS, pollMs = MARKER_POLL_MS } = {}
): () => void {
  const { connection } = gateway
  let debounce: ReturnType<typeof setTimeout> | null = null
  let lastReload = 0
  let poll: ReturnType<typeof setInterval> | null = null

  const reloadSoon = () => {
    if (debounce) {
      return
    }

    const wait = Math.max(0, lastReload + debounceMs - Date.now())

    debounce = setTimeout(() => {
      debounce = null
      lastReload = Date.now()
      void reloadSessions(gateway)
    }, wait)
  }

  const updatePolling = () => {
    const shouldPoll = $appActive.get() && connection.isOpen

    if (shouldPoll && !poll) {
      poll = setInterval(() => void reloadMarkers(gateway), pollMs)
    } else if (!shouldPoll && poll) {
      clearInterval(poll)
      poll = null
    }
  }

  const stopChanged = connection.client.on('sessions.changed', reloadSoon)
  const stopStatus = connection.$status.listen(status => {
    updatePolling()

    if (status === 'open') {
      lastReload = Date.now()
      void reloadSessions(gateway)
      void reloadMarkers(gateway)
    } else if (status === 'offline') {
      // Markers are only true while connected.
      $remoteMarkers.set({})
      $localMarkers.set({})
    }
  })
  const stopActive = $appActive.listen(updatePolling)

  updatePolling()

  return () => {
    stopChanged()
    stopStatus()
    stopActive()

    if (debounce) {
      clearTimeout(debounce)
    }

    if (poll) {
      clearInterval(poll)
    }
  }
}

onGatewayChange(gateway => {
  reset()

  if (gateway) {
    void showSavedSessions(gateway)
  }
})
