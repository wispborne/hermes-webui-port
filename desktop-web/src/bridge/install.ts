/**
 * Installs the browser bridge as `window.hermesDesktop`.
 *
 * Must run before any renderer module: several stores read the bridge while
 * their module is first evaluated (store/translucency, lib/clipboard, ...).
 * `src/main.ts` imports this first, and ES modules run in import order.
 *
 * Skipped when a bridge already exists (Electron, test mocks).
 */
import { createWebBridge } from './bridge'

if (typeof window !== 'undefined' && !window.hermesDesktop) {
  window.hermesDesktop = createWebBridge()
}

export {}
