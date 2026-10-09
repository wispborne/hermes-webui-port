/**
 * Sign-in for MCP servers that use OAuth: the browser version of
 * `hermesDesktop.mcpOauth` (apps/desktop/electron/mcp-oauth-callback-ipc.ts).
 *
 * The app asks the gateway to start a flow with a redirect address the client
 * catches (apps/desktop/src/lib/mcp-dashboard-oauth.ts), then relays the
 * provider's answer back with `mcp.servers.oauth.callback`. The gateway only
 * accepts loopback addresses (http://127.0.0.1:<port>/...), and a page can't
 * listen on a port, so there are two ways in:
 *
 * - The web UI is open on localhost: the redirect goes to
 *   mcp-oauth-callback.html on this same server, which hands the answer to
 *   this tab over a BroadcastChannel.
 * - Anywhere else: the redirect goes to an unused port on the user's own
 *   machine. That page won't load, but its address holds the answer, so the
 *   user pastes it into a dialog here.
 *
 * Either way a dialog stays up while the user signs in. It also has a link to
 * the sign-in page, because the browser may block the tab the app opens (it
 * opens it after a gateway round trip, not straight from the click).
 */

type McpOauthBridge = NonNullable<Window['hermesDesktop']['mcpOauth']>
type OAuthCallback = Awaited<ReturnType<McpOauthBridge['wait']>>

interface Listener {
  id: string
  redirectUri: string
  /** True when the redirect lands on this server (see above). */
  sameServer: boolean
  authUrl?: string
  state?: string
  received?: OAuthCallback
  waiter?: { resolve: (callback: OAuthCallback) => void; reject: (error: unknown) => void }
  timer?: number
  dialog?: SignInDialog
}

const CHANNEL = 'hermes-web:mcp-oauth'
const CALLBACK_PAGE = 'mcp-oauth-callback.html'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const listeners = new Map<string, Listener>()
// Not crypto.randomUUID: that only exists on https and localhost pages.
let nextId = 0
let channel: BroadcastChannel | null = null

/** True when the gateway would accept this page's own address as a redirect. */
function pageIsLoopback(): boolean {
  return (
    window.location.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(window.location.hostname.toLowerCase()) &&
    window.location.port !== '' &&
    'BroadcastChannel' in window
  )
}

/** The gateway rewrites the redirect to this form, and the app compares it exactly. */
function sameServerRedirect(): string {
  const url = new URL(CALLBACK_PAGE, `${window.location.origin}${window.location.pathname}`)

  return `http://${url.host.toLowerCase()}${url.pathname}`
}

/** A port in the dynamic range. Nothing needs to listen on it. */
function unusedPortRedirect(): string {
  const port = 49152 + Math.floor(Math.random() * 16383)

  return `http://127.0.0.1:${port}/callback`
}

function callbackFrom(params: URLSearchParams): OAuthCallback {
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    iss: params.get('iss')
  }
}

function deliver(listener: Listener, callback: OAuthCallback): void {
  if (listener.received) {
    return
  }

  listener.received = callback
  listener.dialog?.finishing()

  if (listener.waiter) {
    window.clearTimeout(listener.timer)
    listener.waiter.resolve(callback)
    listener.waiter = undefined
  }
}

function fail(listener: Listener, error: unknown): void {
  window.clearTimeout(listener.timer)
  listener.waiter?.reject(error)
  listener.waiter = undefined
}

function openChannel(): void {
  if (channel) {
    return
  }

  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent<{ callback?: OAuthCallback }>) => {
    const callback = event.data?.callback

    if (!callback) {
      return
    }

    const waiting = [...listeners.values()].filter(listener => listener.sameServer && !listener.received)
    // Match on state. A callback without one (some providers drop it on
    // errors) goes to the only flow running, if there is just one.
    const listener =
      waiting.find(candidate => candidate.state && candidate.state === callback.state) ??
      (!callback.state && waiting.length === 1 ? waiting[0] : undefined)

    if (listener) {
      deliver(listener, callback)
      channel?.postMessage({ ack: callback.state })
    }
  }
}

function closeChannelIfIdle(): void {
  if (channel && ![...listeners.values()].some(listener => listener.sameServer)) {
    channel.close()
    channel = null
  }
}

async function cancelledError(): Promise<Error> {
  // Loaded late: this file runs before the app's modules (see install.ts).
  // The app skips its error toast for this class.
  const { McpOAuthCancelled } = await import('@/lib/mcp-dashboard-oauth')

  return new McpOAuthCancelled()
}

/**
 * Called by `openExternal` before it opens a tab. When `url` is the sign-in
 * page for a flow we're listening for, note its state and show the dialog.
 */
export function noteAuthUrl(url: string): void {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return
  }

  const redirectUri = parsed.searchParams.get('redirect_uri')
  const listener = [...listeners.values()].find(candidate => candidate.redirectUri === redirectUri)

  if (!listener || listener.authUrl) {
    return
  }

  listener.authUrl = url
  listener.state = parsed.searchParams.get('state') ?? undefined
  listener.dialog = new SignInDialog(listener)
}

export const mcpOauth: McpOauthBridge = {
  listen: async () => {
    const sameServer = pageIsLoopback()
    const listener: Listener = {
      id: `mcp-oauth-${++nextId}`,
      redirectUri: sameServer ? sameServerRedirect() : unusedPortRedirect(),
      sameServer
    }

    listeners.set(listener.id, listener)

    if (sameServer) {
      openChannel()
    }

    return { id: listener.id, redirectUri: listener.redirectUri }
  },
  wait: (id, timeoutMs) =>
    new Promise<OAuthCallback>((resolve, reject) => {
      const listener = listeners.get(id)

      if (!listener) {
        reject(new Error('This MCP sign-in is no longer running'))

        return
      }

      if (listener.received) {
        resolve(listener.received)

        return
      }

      listener.waiter = { resolve, reject }

      if (timeoutMs && timeoutMs > 0) {
        listener.timer = window.setTimeout(
          () => fail(listener, new Error('Timed out waiting for MCP OAuth authorization')),
          timeoutMs
        )
      }
    }),
  cancel: async id => {
    const listener = listeners.get(id)

    if (!listener) {
      return false
    }

    listeners.delete(id)
    listener.dialog?.close()
    fail(listener, new Error('MCP sign-in closed'))
    closeChannelIfIdle()

    return true
  }
}

/**
 * The dialog shown while the user signs in. A native <dialog>, since this
 * file can't use the app's React components. It sits in the top layer, so it
 * shows over any dialog the app has open. That dialog's focus trap and
 * click-outside handling listen on the document, so events from inside this
 * one are stopped before they get there.
 */
class SignInDialog {
  private readonly element = document.createElement('dialog')
  private readonly message = document.createElement('p')
  private readonly problem = document.createElement('p')
  private readonly input = document.createElement('input')
  private submit = document.createElement('button')
  private readonly guard = (event: Event) => {
    const target = event.target instanceof Node ? event.target : null
    const related = event instanceof FocusEvent && event.relatedTarget instanceof Node ? event.relatedTarget : null

    if ((target && this.element.contains(target)) || (related && this.element.contains(related))) {
      event.stopPropagation()
    }
  }
  private static readonly guardedEvents = ['pointerdown', 'mousedown', 'focusin', 'focusout', 'keydown'] as const

  constructor(private readonly listener: Listener) {
    const { element } = this

    element.style.cssText = [
      'pointer-events:auto',
      // The app's CSS reset zeroes margins, which is what centers a modal <dialog>.
      'margin:auto',
      'max-width:min(28rem,calc(100vw - 2rem))',
      'padding:1.25rem',
      'border:1px solid var(--dt-border, GrayText)',
      'border-radius:var(--radius, 0.75rem)',
      'background:var(--dt-popover, Canvas)',
      'color:var(--dt-popover-foreground, CanvasText)',
      'font:inherit',
      'font-size:0.875rem',
      'line-height:1.45',
      'box-shadow:0 10px 40px rgb(0 0 0 / 0.25)'
    ].join(';')
    element.setAttribute('aria-labelledby', `${listener.id}-title`)

    const title = document.createElement('h2')
    title.id = `${listener.id}-title`
    title.textContent = 'Sign in to the MCP server'
    title.style.cssText = 'margin:0 0 0.5rem;font-size:1rem;font-weight:600'

    this.message.style.cssText = 'margin:0 0 0.75rem'
    this.message.textContent = listener.sameServer
      ? 'Finish signing in on the tab that opened. This closes by itself when you’re done.'
      : 'Finish signing in on the tab that opened. That tab then ends on a page that won’t load. ' +
        'That’s expected: copy the address from its address bar and paste it here.'

    const link = document.createElement('a')
    link.href = listener.authUrl ?? ''
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'Open the sign-in page again'
    link.style.cssText = 'color:var(--dt-primary, LinkText)'

    const linkRow = document.createElement('p')
    linkRow.style.cssText = 'margin:0 0 0.75rem'
    linkRow.append(link)

    const form = document.createElement('form')
    form.method = 'dialog'
    form.noValidate = true
    form.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;margin:0'

    if (!listener.sameServer) {
      this.input.type = 'url'
      this.input.placeholder = `${listener.redirectUri}?code=…`
      this.input.setAttribute('aria-label', 'Address of the page sign-in ended on')
      this.input.autocomplete = 'off'
      this.input.spellcheck = false
      this.input.style.cssText = [
        'width:100%',
        'box-sizing:border-box',
        'padding:0.4rem 0.6rem',
        'border:1px solid var(--dt-border, GrayText)',
        'border-radius:calc(var(--radius, 0.75rem) * 0.66)',
        'background:var(--dt-background, Field)',
        'color:inherit',
        'font:inherit'
      ].join(';')
      form.append(this.input)
    }

    this.problem.style.cssText = 'margin:0;color:var(--dt-destructive, #d33);display:none'
    form.append(this.problem)

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:0.5rem;margin-top:0.25rem'

    const cancel = this.button('Cancel', false)
    cancel.type = 'button'
    cancel.addEventListener('click', () => void this.cancel())
    buttons.append(cancel)

    if (!listener.sameServer) {
      this.submit = this.button('Continue', true)
      this.submit.type = 'submit'
      buttons.append(this.submit)
    }

    form.append(buttons)
    form.addEventListener('submit', event => {
      event.preventDefault()
      this.usePastedAddress()
    })

    // Escape closes a native dialog. Treat it as Cancel.
    element.addEventListener('cancel', event => {
      event.preventDefault()
      void this.cancel()
    })

    element.append(title, this.message, linkRow, form)

    for (const type of SignInDialog.guardedEvents) {
      window.addEventListener(type, this.guard, true)
    }

    document.body.append(element)
    element.showModal()
    ;(listener.sameServer ? cancel : this.input).focus()
  }

  /** The answer is in. The dialog stays until the app is done with the flow. */
  finishing(): void {
    this.message.textContent = 'Finishing sign-in…'
    this.problem.style.display = 'none'
    this.input.disabled = true
    this.submit.disabled = true
    this.submit.style.opacity = '0.5'
  }

  close(): void {
    for (const type of SignInDialog.guardedEvents) {
      window.removeEventListener(type, this.guard, true)
    }

    this.element.close()
    this.element.remove()
  }

  private button(label: string, primary: boolean): HTMLButtonElement {
    const button = document.createElement('button')
    button.textContent = label
    button.style.cssText = [
      'padding:0.4rem 0.9rem',
      'border-radius:calc(var(--radius, 0.75rem) * 0.66)',
      'font:inherit',
      'cursor:pointer',
      primary
        ? 'border:1px solid transparent;background:var(--dt-primary, AccentColor);color:var(--dt-primary-foreground, AccentColorText)'
        : 'border:1px solid var(--dt-border, GrayText);background:transparent;color:inherit'
    ].join(';')

    return button
  }

  private showProblem(text: string): void {
    this.problem.textContent = text
    this.problem.style.display = 'block'
    this.input.focus()
  }

  private usePastedAddress(): void {
    const text = this.input.value.trim()
    let pasted: URL

    try {
      pasted = new URL(text)
    } catch {
      this.showProblem('That isn’t a web address. Copy the whole address from the sign-in tab.')

      return
    }

    const expected = new URL(this.listener.redirectUri)

    if (pasted.host !== expected.host || pasted.pathname !== expected.pathname) {
      this.showProblem(`That’s not the page sign-in ended on. Its address starts with ${this.listener.redirectUri}.`)

      return
    }

    const callback = callbackFrom(pasted.searchParams)

    if (!callback.code && !callback.error) {
      this.showProblem('That address has no sign-in result in it. Finish signing in first, then copy the address.')

      return
    }

    if (this.listener.state && callback.state !== this.listener.state) {
      this.showProblem('That address is from a different sign-in. Use the tab this sign-in opened.')

      return
    }

    deliver(this.listener, callback)
  }

  private async cancel(): Promise<void> {
    fail(this.listener, await cancelledError())
  }
}
