// Which notifications the app raises and removes. Plain logic over a small
// `Notifier`, so it can be tested without Android. The real notifier is
// expo-notifications (see wiring.ts).
//
// - "Approval needed — {session}", with Run and Reject buttons, for the first
//   Approval of a session. Removed when its card is removed.
// - "Input needed — {session}" with the first question. Removed with its card.
// - "Hermes finished" (or "Turn failed") when a turn ends off screen.
// Nothing is raised for the session on screen.

import { t } from '@/i18n/t'
import type { SessionPrompts } from '@/store/prompts'

export const CHANNELS = { needsInput: 'needs-input', finished: 'finished' } as const
export const APPROVAL_CATEGORY = 'approval'

export interface NotificationContent {
  title: string
  body: string
  channel: (typeof CHANNELS)[keyof typeof CHANNELS]
  /** Run and Reject buttons. */
  approvalActions?: boolean
  /** Opened when the notification is tapped: `hermes://session/<stored id>`. */
  url: string
  data: Record<string, string>
}

export interface Notifier {
  show(id: string, content: NotificationContent): void
  dismiss(id: string): void
}

export interface NotificationContext {
  /** The app is on screen. */
  appActive: boolean
  /** The chat key of the session on screen, if any. */
  onScreen: string | null
  storedId: string | null
  title: string | null
}

export const sessionUrl = (storedId: string) => `hermes://session/${storedId}`

const named = (key: 'approvalTitleNamed' | 'inputTitleNamed', plain: 'approvalTitle' | 'inputTitle', title: string | null) =>
  title ? t(`notifications.native.${key}`, { session: title }) : t(`notifications.native.${plain}`)

export class Notifications {
  /** Notification ids shown for each session's cards, with whether they had Run and Reject buttons. */
  private readonly shown = new Map<string, Map<string, boolean>>()

  constructor(private readonly notifier: Notifier) {}

  /** Shows or removes the card notifications of one session. */
  promptsChanged(key: string, prompts: SessionPrompts, context: NotificationContext) {
    const wanted = new Map<string, NotificationContent>()
    const quiet = context.appActive && context.onScreen === key

    if (context.storedId && !quiet) {
      const url = sessionUrl(context.storedId)
      const approval = prompts.approvals[0]

      if (approval) {
        wanted.set(`approval:${approval.approvalId}`, {
          title: named('approvalTitleNamed', 'approvalTitle', context.title),
          body: approval.command || approval.description,
          channel: CHANNELS.needsInput,
          approvalActions: !context.appActive,
          url,
          data: { key, approvalId: approval.approvalId, url }
        })
      }

      if (prompts.question) {
        wanted.set(`question:${prompts.question.requestId}`, {
          title: named('inputTitleNamed', 'inputTitle', context.title),
          body: prompts.question.questions[0]?.question ?? t('notifications.native.inputBody'),
          channel: CHANNELS.needsInput,
          url,
          data: { key, url }
        })
      }
    }

    const before = this.shown.get(key) ?? new Map<string, boolean>()

    for (const id of before.keys()) {
      if (!wanted.has(id)) {
        this.notifier.dismiss(id)
      }
    }

    for (const [id, content] of wanted) {
      // Shown again when the buttons change, for example when the app leaves the screen.
      if (before.get(id) !== Boolean(content.approvalActions)) {
        this.notifier.show(id, content)
      }
    }

    this.shown.set(key, new Map([...wanted].map(([id, content]) => [id, Boolean(content.approvalActions)])))
  }

  /** A turn ended. Raises "Hermes finished" only when the app isn't on screen. */
  turnEnded(key: string, failed: boolean, context: NotificationContext) {
    if (context.appActive || !context.storedId) {
      return
    }

    const url = sessionUrl(context.storedId)

    this.notifier.show(`finished:${key}`, {
      title: failed ? t('notifications.native.turnErrorTitle') : t('notifications.native.turnDoneTitle'),
      body: context.title ?? t('notifications.native.turnDoneBody'),
      channel: CHANNELS.finished,
      url,
      data: { key, url }
    })
  }

  /** The person opened a session: its "finished" notification has done its job. */
  sessionOpened(key: string) {
    this.notifier.dismiss(`finished:${key}`)
  }
}
