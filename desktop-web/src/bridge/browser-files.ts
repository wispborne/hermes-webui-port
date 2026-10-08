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

/**
 * Show the browser's file picker and keep the chosen files. Resolves with
 * their paths, or [] when the user cancels.
 */
export function pickBrowserFiles(options: {
  multiple?: boolean
  filters?: Array<{ extensions: string[] }>
}): Promise<string[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple ?? true

    const extensions = options.filters?.flatMap(filter => filter.extensions).filter(ext => ext !== '*') ?? []

    if (extensions.length > 0) {
      input.accept = extensions.map(ext => `.${ext}`).join(',')
    }

    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? [], file => storeBrowserFile(file, file.name)))
    })
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

/** Keep the first image on the clipboard. Resolves with its path, or '' when there is none. */
export async function storeClipboardImage(): Promise<string> {
  // Needs an https page (or localhost) and the user's permission.
  const items = await navigator.clipboard?.read?.().catch(() => [])

  for (const item of items ?? []) {
    const type = item.types.find(candidate => candidate.startsWith('image/'))

    if (type) {
      const blob = await item.getType(type)

      return storeBrowserFile(blob, `clipboard.${type.slice('image/'.length).split('+')[0]}`)
    }
  }

  return ''
}

/** Hand `blob` to the browser as a download named `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'))
    reader.readAsDataURL(blob)
  })
}
