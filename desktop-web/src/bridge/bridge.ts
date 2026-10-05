/**
 * Browser implementation of `window.hermesDesktop`, the bridge the desktop
 * renderer normally gets from Electron's preload (apps/desktop/electron/preload.ts).
 *
 * The renderer already has a full "remote gateway" mode: with
 * `connection.mode === 'remote'`, files, git and sessions all go through the
 * gateway's REST API, and the socket is a plain browser WebSocket. So this
 * bridge only needs real code for HTTP, the socket URL, login, and a few Web
 * APIs (notifications, clipboard, downloads). Everything that needs the local
 * machine (terminal, native git, extra OS windows, updates) is a stub that
 * reports "not available".
 *
 * This object is typed against the renderer's own declaration of the bridge,
 * so when upstream adds a required method, `npm run typecheck` fails here and
 * names it. Optional methods are left out unless the browser can do them: the
 * renderer checks for those before calling and hides the feature.
 */

import type {
  DesktopActiveProfile,
  DesktopBootProgress,
  DesktopBootstrapState,
  DesktopConnectionConfig,
  DesktopConnectionConfigInput,
  DesktopConnectionsRegistry,
  DesktopConnectionTestResult,
  DesktopProfileRoute,
  DesktopRegistryConnection,
  DesktopRegistryConnectionInput,
  HermesConnection
} from '@/global'

import {
  activeAuthMode,
  apiFetch,
  baseUrl,
  fetchStatus,
  freshWsUrl,
  GatewayAuthError,
  isSameOrigin,
  isSignedIn,
  loadGateway,
  loginInPopup,
  normalizeBase,
  resolveToken,
  saveGateway,
  type StoredGateway,
  tokenWsUrl
} from './gateway'

type HermesDesktop = Window['hermesDesktop']

/** The id of the single gateway entry in the connection registry. */
const CONNECTION_ID = 'web'
const DEFAULT_ROUTE_KEY = 'hermes-web.default-route'
const PROFILE_KEY = 'hermes-web.profile'

const noop = (): void => {}
const unsubscribe = (): (() => void) => noop
const unavailable = (what: string) => async (): Promise<never> => {
  throw new Error(`${what} is not available in the web app`)
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)

    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    // Best effort.
  }
}

function connection(profile?: null | string): HermesConnection {
  const token = resolveToken()

  return {
    baseUrl: baseUrl(),
    mode: 'remote',
    remoteKind: 'url',
    source: 'settings',
    // 'oauth' makes the renderer ask getGatewayWsUrl for a fresh URL on every
    // connect, which cookie mode needs because tickets are single-use.
    authMode: activeAuthMode(),
    token,
    wsUrl: token ? tokenWsUrl(token) : '',
    logs: [],
    isFullscreen: false,
    nativeOverlayWidth: 0,
    windowButtonPosition: null,
    connectionId: CONNECTION_ID,
    // One gateway serves every profile, scoped per request (same as a remote
    // primary in Electron, see resolveProfileBackendRoute in main.ts).
    ...(profile ? { profile, sharedPrimary: true } : {})
  }
}

async function connectionConfig(stored: StoredGateway = loadGateway()): Promise<DesktopConnectionConfig> {
  const authMode = activeAuthMode()

  return {
    envOverride: false,
    mode: 'remote',
    profile: null,
    remoteAuthMode: authMode,
    // Report the real session state. A false "connected" would hide the
    // sign-in button and leave the user stuck on a dead connection.
    remoteOauthConnected: authMode === 'oauth' ? await isSignedIn() : false,
    remoteTokenPreview: stored.token ? `...${stored.token.slice(-4)}` : null,
    remoteTokenSet: authMode === 'token',
    // Browser storage is never encrypted at rest. Saying so up front keeps the
    // UI from offering an OS-keychain option that doesn't exist here.
    secureTokenStorage: false,
    remoteTokenPlainText: false,
    // Always a full address. The UI treats an empty URL as "not a remote
    // gateway" and then won't offer its sign-in button.
    remoteUrl: normalizeBase(stored.url),
    cloudOrg: '',
    sshHost: '',
    sshUser: '',
    sshPort: null,
    sshKeyPath: '',
    sshRemoteHermesPath: '',
    sshRemoteProfile: ''
  }
}

function saveConfigInput(input: DesktopConnectionConfigInput): StoredGateway {
  return saveGateway({
    ...(input.remoteAuthMode !== undefined ? { authMode: input.remoteAuthMode } : {}),
    // An omitted token means "keep the saved one".
    ...(input.remoteToken !== undefined ? { token: input.remoteToken } : {}),
    ...(input.remoteUrl !== undefined ? { url: storedUrl(input.remoteUrl) } : {})
  })
}

/** '' when `url` is the server this page came from, so the app keeps following it. */
function storedUrl(url: string): string {
  return normalizeBase(url) === normalizeBase('') ? '' : url.trim()
}

function registryEntry(): DesktopRegistryConnection {
  const stored = loadGateway()

  return {
    id: CONNECTION_ID,
    kind: 'remote',
    label: stored.url ? normalizeBase(stored.url).replace(/^https?:\/\//, '') : 'This server',
    url: stored.url || baseUrl(),
    authMode: activeAuthMode(),
    tokenSet: activeAuthMode() === 'token',
    tokenPreview: stored.token ? `...${stored.token.slice(-4)}` : null
  }
}

function registry(): DesktopConnectionsRegistry {
  return {
    version: 2,
    primary: CONNECTION_ID,
    launchMode: 'primary',
    lastUsed: CONNECTION_ID,
    secureTokenStorage: false,
    connections: [registryEntry()]
  }
}

async function testGateway(remoteUrl?: string): Promise<DesktopConnectionTestResult> {
  const base = normalizeBase(remoteUrl ?? loadGateway().url)

  try {
    const status = await fetchStatus(base)

    return { baseUrl: base, ok: true, reachable: true, version: status.version ?? null }
  } catch (error) {
    return {
      baseUrl: base,
      ok: false,
      reachable: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function readyBootProgress(): DesktopBootProgress {
  return {
    error: null,
    fakeMode: false,
    message: 'Ready',
    phase: 'backend.ready',
    progress: 100,
    running: false,
    timestamp: Date.now()
  }
}

function idleBootstrapState(): DesktopBootstrapState {
  return {
    active: false,
    manifest: null,
    stages: {},
    error: null,
    log: [],
    startedAt: null,
    completedAt: null,
    setupChoice: null,
    unsupportedPlatform: null
  }
}

function openTab(url: string): boolean {
  return Boolean(window.open(url, '_blank', 'noopener'))
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Copy through a hidden textarea. Chromium can report success for Clipboard
 * API writes in installed Wayland web apps without changing the system
 * clipboard; this older path works there. The textarea steals focus and the
 * selection, so both are saved first and put back after.
 */
function copyWithSelection(text: string): boolean {
  const previousActive = document.activeElement
  const selection = document.getSelection()
  const previousRanges: Range[] = []

  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      previousRanges.push(selection.getRangeAt(index).cloneRange())
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(textarea)

  try {
    textarea.select()

    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()

    if (selection) {
      selection.removeAllRanges()

      for (const range of previousRanges) {
        selection.addRange(range)
      }
    }

    if (previousActive instanceof HTMLElement && previousActive.isConnected) {
      previousActive.focus({ preventScroll: true })
    }
  }
}

export function createWebBridge(): HermesDesktop {
  // Captured before the renderer's installClipboardShim() points
  // navigator.clipboard.writeText back at this bridge. Calling the shimmed
  // method from writeClipboard would recurse forever.
  const nativeWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  const nativeReadText = navigator.clipboard?.readText?.bind(navigator.clipboard)

  const bridge: HermesDesktop = {
    // ── Connection ────────────────────────────────────────────────────────
    getConnection: async profile => connection(profile),
    getConnectionFor: async payload => connection(payload.profile),
    getGatewayWsUrl: async () => {
      try {
        return { ok: true, wsUrl: await freshWsUrl() }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        return { ok: false, error: message, needsOauthLogin: error instanceof GatewayAuthError }
      }
    },
    getGatewayWsUrlFor: async payload => bridge.getGatewayWsUrl(payload.profile),
    getProfileRoutes: async profiles =>
      profiles.map(profile => ({
        connectionId: CONNECTION_ID,
        mode: 'remote' as const,
        primary: true as const,
        profile,
        targetProfile: profile
      })),
    revalidateConnection: async () => ({ ok: true, rebuilt: false }),
    touchBackend: async () => ({ ok: true }),
    getPoolLimits: async () => ({ maxBackends: 1, idleMs: 0 }),
    setPoolLimits: async () => ({ ok: false, limits: { maxBackends: 1, idleMs: 0 } }),
    getBootProgress: async () => readyBootProgress(),
    onBootProgress: unsubscribe,
    onBackendExit: unsubscribe,

    getConnectionConfig: async () => connectionConfig(),
    saveConnectionConfig: async input => connectionConfig(saveConfigInput(input)),
    applyConnectionConfig: async input => {
      const next = saveConfigInput(input)
      // A reload re-runs the whole boot against the new gateway, which is what
      // the desktop does on "Save and reconnect". Wait a moment so this
      // promise settles before the page goes away.
      setTimeout(() => window.location.reload(), 50)

      return connectionConfig(next)
    },
    testConnectionConfig: async input => testGateway(input.remoteUrl),
    probeConnectionConfig: async remoteUrl => {
      const base = normalizeBase(remoteUrl)

      try {
        const status = await fetchStatus(base)

        return {
          baseUrl: base,
          reachable: true,
          authMode: status.auth_required ? 'oauth' : 'token',
          providers: (status.auth_providers ?? []).map(name => ({ name, displayName: name })),
          version: status.version ?? null,
          error: null
        }
      } catch (error) {
        return {
          baseUrl: base,
          reachable: false,
          authMode: 'unknown',
          providers: [],
          version: null,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    },
    oauthLoginConnectionConfig: async remoteUrl => {
      const base = remoteUrl ? normalizeBase(remoteUrl) : baseUrl()

      // The login cookie is host-only and SameSite=Lax, so the browser will
      // never send it to a gateway on another origin.
      if (!isSameOrigin(base)) {
        return {
          ok: false,
          baseUrl: base,
          connected: false,
          error:
            `${base} is on a different origin than this page, so the browser can't keep its login. ` +
            'Serve the web app from that gateway (HERMES_WEB_DIST), proxy it onto this origin, or use a session token.'
        }
      }

      const connected = await loginInPopup(base)

      return { ok: true, baseUrl: base, connected, connectionId: CONNECTION_ID }
    },
    oauthLogoutConnectionConfig: async remoteUrl => {
      const base = remoteUrl ? normalizeBase(remoteUrl) : baseUrl()
      await fetch(`${base}/auth/logout`, { method: 'POST', credentials: 'same-origin' })

      return { ok: true, connected: false }
    },
    getSecretStorageEncryption: async () => ({ on: false }),
    setSecretStorageEncryption: async () => ({ on: false }),

    connections: {
      list: async () => registry(),
      save: async (input: DesktopRegistryConnectionInput) => {
        // The browser can only hold one gateway (see gateway.ts), so every
        // save edits that one entry.
        saveGateway({
          ...(input.url !== undefined ? { url: storedUrl(input.url) } : {}),
          ...(input.authMode !== undefined ? { authMode: input.authMode } : {}),
          ...(input.token !== undefined ? { token: input.token } : {})
        })

        return { ok: true, connection: registryEntry(), registry: registry() }
      },
      remove: async () => ({ ok: false, registry: registry() }),
      setPrimary: async () => ({ ok: true, registry: registry() }),
      setLaunchMode: async () => ({ ok: true, registry: registry() }),
      setLastUsed: async () => ({ ok: true, registry: registry() }),
      test: async () => testGateway()
    },
    sshConfigHosts: async () => ({ hosts: [] }),
    sshResolveHost: async () => ({ hostname: null, identityFile: null, port: null, user: null }),
    cloud: {
      status: async () => ({ portalBaseUrl: '', signedIn: false }),
      login: unavailable('Hermes Cloud sign-in'),
      logout: async () => ({ ok: true, portalBaseUrl: '', signedIn: false }),
      discover: unavailable('Hermes Cloud discovery'),
      agentSignIn: unavailable('Hermes Cloud sign-in')
    },

    // ── Profiles ──────────────────────────────────────────────────────────
    profile: {
      getDefault: async () => readJson<DesktopProfileRoute | null>(DEFAULT_ROUTE_KEY, null),
      setDefault: async route => {
        writeJson(DEFAULT_ROUTE_KEY, route)

        return route
      },
      onDefaultChanged: unsubscribe,
      get: async (): Promise<DesktopActiveProfile> => ({ profile: readJson<null | string>(PROFILE_KEY, null) }),
      remember: async name => {
        writeJson(PROFILE_KEY, name)

        return { profile: name }
      },
      set: async name => {
        writeJson(PROFILE_KEY, name)

        return { profile: name }
      }
    },

    // ── REST and Web APIs ─────────────────────────────────────────────────
    api: apiFetch,
    notify: async payload => {
      if (!('Notification' in window)) {
        return false
      }

      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }

      if (Notification.permission !== 'granted') {
        return false
      }

      new Notification(payload.title ?? 'Hermes', { body: payload.body, silent: payload.silent, tag: payload.tag })

      return true
    },
    requestMicrophoneAccess: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(track => track.stop())

        return true
      } catch {
        return false
      }
    },
    writeClipboard: async text => {
      if (copyWithSelection(text)) {
        return true
      }

      try {
        await nativeWriteText?.(text)

        return Boolean(nativeWriteText)
      } catch {
        return false
      }
    },
    readClipboard: async () => {
      try {
        return (await nativeReadText?.()) ?? ''
      } catch {
        return ''
      }
    },
    saveImageFromUrl: async url => openTab(url),
    saveImageBuffer: async (data, ext, name) => {
      const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data)
      const filename = name || `hermes-image.${ext}`
      downloadBlob(new Blob([bytes]), filename)

      return filename
    },
    openExternal: async url => {
      openTab(url)
    },
    openPreviewInBrowser: async url => {
      openTab(url)
    },
    fetchLinkTitle: async url => url,

    // ── Windows ───────────────────────────────────────────────────────────
    openSessionWindow: async sessionId => {
      if (!sessionId) {
        return { ok: false, error: 'invalid-session' }
      }

      return openTab(`${window.location.pathname}#/${encodeURIComponent(sessionId)}`)
        ? { ok: true }
        : { ok: false, error: 'popup-blocked' }
    },
    openWindow: async () =>
      openTab(`${window.location.pathname}${window.location.hash}`) ? { ok: true } : { ok: false, error: 'popup-blocked' },
    openSessionInTerminal: async () => ({ ok: false, error: 'unavailable' }),
    openBrowserWindow: async () => ({ ok: false, error: 'unavailable' }),
    onBrowserPopoutClosed: unsubscribe,
    // Each browser tab is on its own, so every tab may play its own cues.
    claimAmbientCue: async () => true,
    windowControls: { custom: false, minimize: noop, toggleMaximize: noop, close: noop },
    petOverlay: {
      open: async () => ({ ok: false }),
      close: async () => ({ ok: true }),
      setBounds: noop,
      setIgnoreMouse: noop,
      setFocusable: noop,
      pushState: noop,
      control: noop,
      onState: unsubscribe,
      onControl: unsubscribe
    },
    quickEntry: {
      getSettings: async () => ({ enabled: false, error: null, registered: false, shortcut: '' }),
      setSettings: async () => ({ enabled: false, error: null, registered: false, shortcut: '' }),
      submit: noop,
      dismiss: noop,
      pushState: noop,
      onState: unsubscribe,
      onSubmit: unsubscribe,
      onShown: unsubscribe
    },
    findInPage: async () => ({ count: 0 }),
    stopFindInPage: async () => {},
    onFoundInPage: unsubscribe,
    onOpenFindBarRequested: unsubscribe,

    // ── Local machine (not available in a browser) ───────────────────────
    readFileDataUrl: unavailable('Local file access'),
    readFileText: unavailable('Local file access'),
    readDir: async () => ({ entries: [], error: 'Local file access is not available in the web app' }),
    selectPaths: async () => [],
    savePastedText: unavailable('Saving pasted text to disk'),
    saveClipboardImage: async () => '',
    getPathForFile: () => '',
    normalizePreviewTarget: async () => null,
    watchPreviewFile: async url => ({ id: '', path: url }),
    stopPreviewFileWatch: async () => true,
    onPreviewFileChanged: unsubscribe,
    sanitizeWorkspaceCwd: async cwd => ({ cwd: cwd ?? '', sanitized: false }),
    settings: {
      getDefaultProjectDir: async () => ({ defaultLabel: '', dir: null, resolvedCwd: '' }),
      pickDefaultProjectDir: async () => ({ canceled: true, dir: null }),
      setDefaultProjectDir: async dir => ({ dir })
    },
    terminal: {
      attach: async () => false,
      cwd: async () => null,
      dispose: async () => true,
      onData: unsubscribe,
      onExit: unsubscribe,
      resize: async () => false,
      start: unavailable('The local terminal'),
      write: async () => false
    },
    revealLogs: async () => ({ ok: false, path: '' }),
    getRecentLogs: async () => ({ path: '', lines: [] }),

    // ── Install, update, version ─────────────────────────────────────────
    getBootstrapState: async () => idleBootstrapState(),
    continueBootstrapLocal: async () => ({ ok: false }),
    resetBootstrap: async () => ({ ok: true }),
    repairBootstrap: async () => ({ ok: true }),
    cancelBootstrap: async () => ({ ok: true, cancelled: true }),
    onBootstrapEvent: unsubscribe,
    getVersion: async () => ({
      appVersion: __HERMES_WEB_VERSION__,
      commit: __HERMES_WEB_COMMIT__ || null,
      electronVersion: '',
      nodeVersion: '',
      platform: 'web',
      hermesRoot: ''
    }),
    updates: {
      check: async () => ({ supported: false }),
      apply: async () => ({ ok: false }),
      getBranch: async () => ({ branch: '' }),
      setBranch: async () => ({ branch: '' }),
      onProgress: unsubscribe
    },
    uninstall: {
      summary: unavailable('Uninstall'),
      run: unavailable('Uninstall')
    },
    themes: {
      fetchMarketplace: unavailable('Marketplace themes'),
      searchMarketplace: async () => []
    }
  }

  return bridge
}
