/**
 * Whether a paste gets its bare URLs and bare `@path` tokens converted into
 * `@url:` / `@file:` context chips.
 *
 * Chipping is not free. The gateway expands every `@url:` in the message text
 * *before* it accepts the prompt (agent/context_references.py -> web_extract_tool),
 * so a pasted terminal block carrying a dead URL stalls the send on
 * web.extract_timeout (120s by default). Verbatim means what you copied is what
 * gets sent.
 *
 * Browser-local preference: the web port has no Electron userData to write to.
 * Flip it from devtools and reload:
 *   localStorage.setItem('hermes.paste.chipRefs', '1')   // chipping (old behavior)
 *   localStorage.setItem('hermes.paste.chipRefs', '0')   // verbatim paste (default)
 */

import { atom } from 'nanostores'

import { pathifyRefs } from './path-refs'
import { linkifyUrls } from './url-refs'

const STORAGE_KEY = 'hermes.paste.chipRefs'

// No key set => verbatim paste. Only '1' restores chipping.
const chipRefsEnabled = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const $pasteChipRefs = atom<boolean>(typeof window === 'undefined' ? false : chipRefsEnabled())

export function setPasteChipRefs(enabled: boolean): void {
  $pasteChipRefs.set(enabled)

  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Best-effort like the composer draft itself: a blocked storage API must not
    // break the paste.
  }
}

/** Paste text as it should enter the composer: chipped, or exactly what was copied. */
export function pasteComposerText(text: string): string {
  return $pasteChipRefs.get() ? pathifyRefs(linkifyUrls(text)) : text
}

if (typeof window !== 'undefined') {
  // Two tabs, one preference: whichever tab flips it, the others follow.
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      $pasteChipRefs.set(chipRefsEnabled())
    }
  })
}
