// Reads a delivered file's bytes from the gateway, for one MEDIA directive in
// a transcript.
//
// The gateway answers `GET /api/fs/read-data-url?path=<abs path>` with
// `{"dataUrl": "data:<mime>;base64,..."}` (hermes_cli/web_routers/files.py).
// Size cap, sensitive paths and missing files come back as 413, 403 and 404 —
// the caller shows its fallback chip for all of them. The mobile REST layer
// rides the sign-in cookies, so no extra auth is needed here. The desktop does
// the same call in remote gateway mode (apps/desktop/src/lib/desktop-fs.ts,
// readDesktopFileDataUrl).
//
// Results are kept in a small cache keyed by path, so FlatList re-renders and
// reopens don't refetch the same file. A failed read is not kept: the next
// render may find the file there after all.

import { isInlineMediaSrc } from '@/chat/media'

import type { GatewayRest } from './rest'

/** How many files are kept. A transcript shows a handful at a time. */
const MAX_CACHED = 16

/** Path to the data URL, or the in-flight read. Most-recently used last. */
const cache = new Map<string, Promise<string>>()

/**
 * The `data:` URL for a MEDIA directive's path. A `data:` or `http(s)` value
 * already carries the bytes or a URL the image element can use, so it's
 * returned as it is, with no read.
 */
export function loadMediaDataUrl(rest: GatewayRest, path: string): Promise<string> {
  if (isInlineMediaSrc(path)) {
    return Promise.resolve(path)
  }

  const cached = cache.get(path)

  if (cached) {
    // Mark it used: Map keeps insertion order, so re-inserting moves it to the fresh end.
    cache.delete(path)
    cache.set(path, cached)

    return cached
  }

  const loading = readDataUrl(rest, path)
  cache.set(path, loading)

  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next()

    if (!oldest.done) {
      cache.delete(oldest.value)
    }
  }

  // A failed read is dropped from the cache, but the caller's own promise keeps its failure.
  loading.catch(() => {
    if (cache.get(path) === loading) {
      cache.delete(path)
    }
  })

  return loading
}

async function readDataUrl(rest: GatewayRest, path: string): Promise<string> {
  const answer = await rest.get<{ dataUrl?: string } | string>('/api/fs/read-data-url', { path })
  const dataUrl = typeof answer === 'string' ? answer : (answer?.dataUrl ?? '')

  if (!dataUrl) {
    throw new Error(`The gateway sent no file data for ${path}`)
  }

  return dataUrl
}

/** Forget everything cached. Tests use it between gateways. */
export function clearMediaDataCache(): void {
  cache.clear()
}
