// What the Session screen's list shows. Hermes's thinking and its tool calls
// between two messages are drawn as one block of short lines, so a turn that
// reads twenty files doesn't fill the screen with cards.

import type { AssistantItem, ChatItem, NoteItem, ToolItem, UserItem } from './items'

/** Hermes's reasoning before a reply or a tool call. */
export interface ThinkingStep {
  kind: 'thinking'
  key: string
  text: string
  /** Hermes is still writing it. */
  streaming: boolean
}

export type ActivityStep = ThinkingStep | ToolItem

/** Thinking and tool calls in a row, with no message between them. */
export interface ActivityItem {
  kind: 'activity'
  key: string
  steps: ActivityStep[]
  /** The turn is running and nothing comes after this block yet. */
  live: boolean
}

export type DisplayItem = UserItem | AssistantItem | NoteItem | ActivityItem

// Made once per item, so an item that didn't change keeps the same object and doesn't redraw.
const thinkingSteps = new WeakMap<AssistantItem, ThinkingStep>()
const replies = new WeakMap<AssistantItem, AssistantItem>()

function thinkingOf(item: AssistantItem): ThinkingStep {
  let step = thinkingSteps.get(item)

  if (!step) {
    step = { kind: 'thinking', key: `${item.key}-thinking`, text: item.reasoning ?? '', streaming: Boolean(item.streaming && !item.text) }
    thinkingSteps.set(item, step)
  }

  return step
}

/** The reply without its reasoning, which is drawn in the activity block before it. */
function replyOf(item: AssistantItem): AssistantItem {
  let reply = replies.get(item)

  if (!reply) {
    reply = { ...item, reasoning: undefined }
    replies.set(item, reply)
  }

  return reply
}

// A reply's text changes its item, and so its thinking step, on every delta. Compare thinking by what it shows.
const sameStep = (a: ActivityStep, b: ActivityStep) =>
  a === b || (a.kind === 'thinking' && b.kind === 'thinking' && a.key === b.key && a.text === b.text && a.streaming === b.streaming)

const sameSteps = (a: ActivityStep[], b: ActivityStep[]) => a.length === b.length && a.every((step, index) => sameStep(step, b[index]))

/**
 * Turns items into what the list draws. An assistant item's reasoning becomes
 * a thinking step, and its text, if any, a reply after it. Thinking and tool
 * calls next to each other share one activity block.
 *
 * `previous` is the last result, by key. A block whose steps didn't change is
 * handed back as the same object, so it doesn't redraw while a reply streams.
 */
export function displayItems(items: ChatItem[], running: boolean, previous?: ReadonlyMap<string, DisplayItem>): DisplayItem[] {
  const shown: DisplayItem[] = []
  let steps: ActivityStep[] = []

  const closeBlock = () => {
    if (steps.length) {
      shown.push({ kind: 'activity', key: `activity-${steps[0].key}`, steps, live: false })
      steps = []
    }
  }

  for (const item of items) {
    switch (item.kind) {
      case 'tool':
        steps.push(item)
        break

      case 'assistant':
        if (!item.reasoning) {
          closeBlock()
          shown.push(item)
          break
        }

        steps.push(thinkingOf(item))

        if (item.text || item.error || item.stopped) {
          closeBlock()
          shown.push(replyOf(item))
        }

        break

      default:
        closeBlock()
        shown.push(item)
    }
  }

  closeBlock()

  return shown.map((item, index) => {
    if (item.kind !== 'activity') {
      return item
    }

    const live = running && index === shown.length - 1
    const before = previous?.get(item.key)

    if (before?.kind === 'activity' && before.live === live && sameSteps(before.steps, item.steps)) {
      return before
    }

    return { ...item, live }
  })
}

/** The step is happening now: thinking that is still being written, or a tool call that hasn't finished. */
export const inProgress = (step: ActivityStep) => (step.kind === 'thinking' ? step.streaming : step.running)
