/**
 * Files the user hands to the web app (pasted text, pasted or dropped images,
 * dropped files), kept in browser memory.
 *
 * The desktop app saves these to disk and later reads them back by path, for
 * example to upload an attachment to a remote gateway when a message is sent.
 * A browser has no disk to save to. So each file gets a made-up path under
 * `/browser/`, and the bridge's read methods look that path up here.
 *
 * Files stay until the page is closed or reloaded.
 */

const ROOT = '/browser/'

const files = new Map<string, Blob>()

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // randomUUID only exists on https pages and localhost.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

/** Keep `blob` and return the path it can be read back from. */
export function storeBrowserFile(blob: Blob, name: string): string {
  // Strip folders so the name stays one path part.
  const safeName = name.split(/[\\/]/).pop() || 'file'
  const path = `${ROOT}${newId()}/${safeName}`
  files.set(path, blob)

  return path
}

/** The stored file for `path`, or null when the path isn't one of ours. */
export function browserFile(path: string): Blob | null {
  // Callers sometimes pass a file:// URL built from the path.
  const plain = path.replace(/^file:\/\//, '')

  return files.get(plain) ?? files.get(decodeURIComponent(plain)) ?? null
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}
