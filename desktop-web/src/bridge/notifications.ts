/**
 * Browser notifications for the web bridge.
 *
 * The desktop app decides when to notify (apps/desktop/src/store/native-notifications.ts)
 * and calls `hermesDesktop.notify`. In Electron, the main process shows the
 * notification and reports clicks back. Here the page shows it with the Web
 * Notification API and handles clicks itself:
 *
 * - A click on a chat notification focuses this tab and opens that chat.
 * - A click on a plugin notification focuses this tab and runs the plugin's
 *   click handler or opens its page.
 *
 * Page notifications can't have buttons, so approval notifications have no
 * Approve or Reject buttons. Clicking one opens the chat, where the approval
 * bar is.
 *
 * Browsers only show notifications on https pages (or localhost), and only
 * after the user allows them. Firefox and Safari only show the permission
 * prompt in response to a click, so the bridge asks on the first click in the
 * page while notifications are turned on in settings.
 */
type HermesNotification = Parameters<Window['hermesDesktop']['notify']>[0]

type FocusSessionListener = (sessionId: string) => void
type ActivateListener = (payload: { actionId?: string; activate?: string; notifyId?: string; tag?: string }) => void

/** The desktop app's settings key for native notifications (store/native-notifications.ts). */
const PREFS_KEY = 'hermes:native-notifications'

/** Approvals and questions block the agent, so they stay on screen until handled. */
const STICKY_KINDS = new Set(['approval', 'input'])

const focusSessionListeners = new Set<FocusSessionListener>()
const activateListeners = new Set<ActivateListener>()

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window

function notificationsTurnedOn(): boolean {
  try {
    const raw = localStorage.getItem(PREFS_KEY)

    return raw ? (JSON.parse(raw) as { enabled?: boolean }).enabled !== false : true
  } catch {
    return true
  }
}

async function askPermission(): Promise<NotificationPermission> {
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission()
    } catch {
      return Notification.permission
    }
  }

  return Notification.permission
}

function handleClick(payload: HermesNotification): void {
  window.focus()

  const sessionId = payload.focusSessionId ?? payload.sessionId

  if (sessionId) {
    focusSessionListeners.forEach(listener => listener(sessionId))

    return
  }

  if (payload.activate || payload.notifyId) {
    const event = { activate: payload.activate, notifyId: payload.notifyId, tag: payload.tag }
    activateListeners.forEach(listener => listener(event))
  }
}

export async function notify(payload: HermesNotification): Promise<boolean> {
  if (!supported() || (await askPermission()) !== 'granted') {
    return false
  }

  try {
    const notification = new Notification(payload.title ?? 'Hermes', {
      body: payload.body,
      // `payload.icon` is a file path on the desktop machine, so use the app icon.
      icon: '/hermes.png',
      requireInteraction: STICKY_KINDS.has(payload.kind ?? ''),
      silent: payload.silent,
      // One notification per chat or plugin: a newer one replaces the older one.
      tag: payload.focusSessionId ?? payload.sessionId ?? payload.tag
    })

    notification.onclick = () => {
      notification.close()
      handleClick(payload)
    }

    return true
  } catch {
    // Some mobile browsers have the API but only allow notifications from a
    // service worker, and throw here.
    return false
  }
}

export function onFocusSession(listener: FocusSessionListener): () => void {
  focusSessionListeners.add(listener)

  return () => void focusSessionListeners.delete(listener)
}

export function onNotificationActivate(listener: ActivateListener): () => void {
  activateListeners.add(listener)

  return () => void activateListeners.delete(listener)
}

/** Ask for permission on the first click, so the prompt works in every browser. */
export function askPermissionOnFirstClick(): void {
  if (!supported() || Notification.permission !== 'default') {
    return
  }

  window.addEventListener(
    'pointerdown',
    () => {
      if (notificationsTurnedOn()) {
        void askPermission()
      }
    },
    { capture: true, once: true }
  )
}
