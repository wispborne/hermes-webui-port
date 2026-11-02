// Slash commands typed in the message box, run the way the desktop's
// use-prompt-actions/slash.ts runs them. A few are done on the phone: /new
// (and /reset and /clear), /model with no model, and /stop. The rest go to the
// gateway: `slash.exec` for a session it has, `command.dispatch` otherwise or
// when `slash.exec` refuses. Output shows as a note in the transcript.

import { parseCommandDispatch, parseSlashCommand } from '@hermes/shared/slash'

import { t } from '@/i18n/t'

import { addNote, chatStore, sendMessage, stopTurn } from './chat'
import { $gateway } from './gateway'

/** What the screen does after a command. */
export type SlashOutcome =
  | { kind: 'done' }
  | { kind: 'new-session' }
  | { kind: 'pick-model' }
  /** Put this text in the message box, to edit and send. */
  | { kind: 'prefill'; text: string }

const NEW_SESSION = new Set(['new', 'reset', 'clear'])

/** One suggestion while the person types a command. */
export interface SlashSuggestion {
  /** The text that replaces the message box's, such as "/help ". */
  text: string
  /** What the list shows, such as "/help". */
  label: string
  description: string
}

/** Suggestions for the command typed so far, from the gateway's `complete.slash`. */
export async function suggestCommands(key: string, typed: string): Promise<SlashSuggestion[]> {
  const gateway = $gateway.get()

  if (!gateway?.connection.isOpen) {
    return []
  }

  const { runtimeId } = chatStore(key).get()
  const answer = await gateway.connection.client.request<{
    items?: { text: string; display?: string; meta?: string }[]
    replace_from?: number | null
  } | null>('complete.slash', { text: typed, ...(runtimeId ? { session_id: runtimeId } : {}) })
  // Past the command's name, the gateway completes its argument from `replace_from`.
  const from = answer?.replace_from ?? 0

  return (answer?.items ?? []).map(item => {
    const text = from > 1 ? typed.slice(0, from) + item.text : item.text

    return { text: text.endsWith(' ') ? text : `${text} `, label: item.display || item.text, description: item.meta ?? '' }
  })
}

export async function runSlashCommand(key: string, typed: string): Promise<SlashOutcome> {
  const { name, arg } = parseSlashCommand(typed)

  if (!name) {
    addNote(key, t('desktop.emptySlashCommand'), 'error')

    return { kind: 'done' }
  }

  if (NEW_SESSION.has(name)) {
    return { kind: 'new-session' }
  }

  if (name === 'model' && !arg) {
    return { kind: 'pick-model' }
  }

  if (name === 'stop') {
    await stopTurn(key)

    return { kind: 'done' }
  }

  const gateway = $gateway.get()

  if (!gateway?.connection.isOpen) {
    addNote(key, t('desktop.sessionUnavailable'), 'error', `/${name}`)

    return { kind: 'done' }
  }

  const { client } = gateway.connection
  const { runtimeId } = chatStore(key).get()
  let execError: unknown = null

  if (runtimeId) {
    try {
      const answer = await client.request<Record<string, unknown> | null>('slash.exec', { session_id: runtimeId, command: `${name} ${arg}`.trim() })
      const directive = parseCommandDispatch(answer)

      if (directive) {
        return await followDirective(key, name, arg, typed, directive)
      }

      const output = typeof answer?.output === 'string' && answer.output ? answer.output : t('app.slash.noOutput', { command: `/${name}` })
      const warning = typeof answer?.warning === 'string' && answer.warning ? `${t('desktop.warningLine', { message: answer.warning })}\n` : ''
      addNote(key, warning + output, 'info', `/${name}`)

      return { kind: 'done' }
    } catch (error) {
      execError = error
    }
  }

  try {
    const answer = await client.request<unknown>('command.dispatch', { name, arg, ...(runtimeId ? { session_id: runtimeId } : {}) })
    const directive = parseCommandDispatch(answer)

    if (directive) {
      return await followDirective(key, name, arg, typed, directive)
    }

    addNote(key, t('app.slash.noOutput', { command: `/${name}` }), 'info', `/${name}`)
  } catch (error) {
    // A command that is neither a gateway command nor a skill: say why slash.exec refused it, if it did.
    const shown = execError ?? error
    addNote(key, shown instanceof Error ? shown.message : String(shown), 'error', `/${name}`)
  }

  return { kind: 'done' }
}

async function followDirective(
  key: string,
  name: string,
  arg: string,
  typed: string,
  directive: NonNullable<ReturnType<typeof parseCommandDispatch>>
): Promise<SlashOutcome> {
  switch (directive.type) {
    case 'exec':
    case 'plugin':
      addNote(key, directive.output || t('app.slash.noOutput', { command: `/${name}` }), 'info', `/${name}`)

      return { kind: 'done' }

    case 'alias':
      return runSlashCommand(key, `/${directive.target} ${arg}`.trim())

    case 'send':
      if (directive.notice) {
        addNote(key, directive.notice, 'info', `/${name}`)
      }

      // `message` can be a skill's instructions, which aren't shown: the message shows what was typed.
      await sendMessage(key, directive.message, [], directive.display ?? typed.trim())

      return { kind: 'done' }

    case 'skill':
      if (!directive.message) {
        addNote(key, t('app.slash.skillEmpty', { command: `/${name}` }), 'error', `/${name}`)

        return { kind: 'done' }
      }

      await sendMessage(key, directive.message, [], directive.display ?? typed.trim())

      return { kind: 'done' }

    case 'prefill':
      if (directive.notice) {
        addNote(key, directive.notice, 'info', `/${name}`)
      }

      return { kind: 'prefill', text: directive.message }
  }
}
