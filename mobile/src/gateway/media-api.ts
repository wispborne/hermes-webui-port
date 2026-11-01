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
// An `http(s)` image the phone can't load itself can be fetched by the gateway
// instead: `GET /api/media/proxy?url=<url>` answers `{"data_url": ...}` for the
// image hosts it allows (the desktop's gatewayImageProxyDataUrl).
//
// Results are kept in a small cache keyed by path, so FlatList re-renders and
// reopens don't refetch the same file. The cache holds at most 16 files and
// about 24 MB of data URL text, and is emptied when the phone signs in to a
// different gateway. A failed read is not kept: the next render may find the
// file there after all.

import { isInlineMediaSrc } from '@/chat/media'

import type { GatewayRest } from './rest'

/** How many files are kept. A transcript shows a handful at a time. */
const MAX_CACHED = 16

/** How much data URL text is kept, in characters. One large photo can be several MB. */
const MAX_CACHED_CHARS = 24_000_000

interface CachedRead {
  loading: Promise<string>
  /** The data URL's length once it has arrived; 0 while the read runs. */
  size: number
}

/** Path to the read. Most-recently used last. */
const cache = new Map<string, CachedRead>()

/** The gateway the cache holds files from. The same path on another gateway is another file. */
let cacheOwner: GatewayRest | null = null

/**
 * The `data:` URL for a MEDIA directive's path. A `data:` or `http(s)` value
 * already carries the bytes or a URL the image element can use, so it's
 * returned as it is, with no read.
 */
export function loadMediaDataUrl(rest: GatewayRest, path: string): Promise<string> {
  if (isInlineMediaSrc(path)) {
    return Promise.resolve(path)
  }

  return cachedRead(rest, path, () => readDataUrl(rest, '/api/fs/read-data-url', { path }))
}

/** An `http(s)` image fetched by the gateway, for when the phone can't load the URL itself. */
export function loadProxiedImage(rest: GatewayRest, url: string): Promise<string> {
  if (!/^https?:/i.test(url)) {
    return Promise.reject(new Error(`Only http(s) images go through the proxy, not ${url}`))
  }

  return cachedRead(rest, `proxy:${url}`, () => readDataUrl(rest, '/api/media/proxy', { url }))
}

function cachedRead(rest: GatewayRest, key: string, read: () => Promise<string>): Promise<string> {
  if (cacheOwner !== rest) {
    cache.clear()
    cacheOwner = rest
  }

  const cached = cache.get(key)

  if (cached) {
    // Mark it used: Map keeps insertion order, so re-inserting moves it to the fresh end.
    cache.delete(key)
    cache.set(key, cached)

    return cached.loading
  }

  const entry: CachedRead = { loading: read(), size: 0 }
  cache.set(key, entry)
  trimCache()

  entry.loading.then(
    dataUrl => {
      if (cache.get(key) === entry) {
        entry.size = dataUrl.length
        trimCache()
      }
    },
    // A failed read is dropped from the cache, but the caller's own promise keeps its failure.
    () => {
      if (cache.get(key) === entry) {
        cache.delete(key)
      }
    }
  )

  return entry.loading
}

/** Drop the oldest reads until the cache fits. The newest one always stays. */
function trimCache(): void {
  let chars = 0

  for (const entry of cache.values()) {
    chars += entry.size
  }

  while (cache.size > 1 && (cache.size > MAX_CACHED || chars > MAX_CACHED_CHARS)) {
    const oldest = cache.keys().next()

    if (oldest.done) {
      return
    }

    chars -= cache.get(oldest.value)?.size ?? 0
    cache.delete(oldest.value)
  }
}

async function readDataUrl(rest: GatewayRest, route: string, query: Record<string, string>): Promise<string> {
  const answer = await rest.get<{ dataUrl?: string; data_url?: string } | string>(route, query)
  // read-data-url answers `dataUrl`; the media routes answer `data_url`.
  const dataUrl = typeof answer === 'string' ? answer : (answer?.dataUrl ?? answer?.data_url ?? '')

  if (!dataUrl) {
    throw new Error(`The gateway sent no file data for ${query.path ?? query.url}`)
  }

  return dataUrl
}

/** Forget everything cached. Tests use it between gateways. */
export function clearMediaDataCache(): void {
  cache.clear()
  cacheOwner = null
}
