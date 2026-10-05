/**
 * Stops the browser's own right-click menu from opening over the app's menu.
 *
 * The desktop app never blocks the browser menu, because Electron shows no
 * menu of its own (apps/desktop/src/app/context-menu/app-context-menu.tsx).
 * A real browser does, so this blocks it on every right-click, which matches
 * what the desktop app shows.
 *
 * Radix context menu triggers (session rows, tabs, the status bar) are left
 * alone. Radix skips opening its menu when the event is already blocked, and
 * it blocks the browser menu itself when it opens.
 *
 * This listener has to run before the app's, because the app's listener stops
 * the event from reaching anything else. Listeners on the same target run in
 * the order they were added, and `src/main.ts` imports this before the app.
 */
import { HERMES_CONTEXT_MENU_TRIGGER_ATTR } from '@/components/ui/context-menu'

const RADIX_TRIGGER = `[${HERMES_CONTEXT_MENU_TRIGGER_ATTR}], [data-slot="context-menu-trigger"]`

if (typeof window !== 'undefined') {
  window.addEventListener(
    'contextmenu',
    event => {
      const element = event.target instanceof Element ? event.target : null

      if (!element?.closest(RADIX_TRIGGER)) {
        event.preventDefault()
      }
    },
    true
  )
}

export {}
