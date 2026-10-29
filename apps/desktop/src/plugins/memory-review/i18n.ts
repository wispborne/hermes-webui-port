/**
 * Plugin-scoped strings for memory review, registered under the plugin id
 * through ctx.i18n.register so core en.ts stays untouched. Other locales fall
 * back to English.
 */

import { type PluginLocaleBundles, type PluginTranslate, usePluginI18n } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const en = {
  nav: 'Memory review',
  openPage: 'Open memory review',
  title: 'Pending memories',
  waiting: (n: number) => `${plural(n, 'memory', 'memories')} waiting for review`,
  countTip: (n: number) => `${plural(n, 'pending memory', 'pending memories')}. Click to review.`,
  approval: 'Ask before saving memories',
  approvalHelp: "When this is on, Hermes asks you before it saves a memory. If it can't ask, the memory waits here.",
  refresh: 'Refresh',
  approve: 'Approve',
  reject: 'Reject',
  approveAll: 'Approve all',
  rejectAll: 'Reject all',
  approveAllTitle: (n: number) => `Approve ${plural(n, 'memory', 'memories')}?`,
  approveAllBody: 'Each one is saved. Edits and removals change your existing memories.',
  rejectAllTitle: (n: number) => `Reject ${plural(n, 'memory', 'memories')}?`,
  rejectAllBody: 'Each one is deleted without being saved.',
  dismiss: 'Dismiss',
  action: {
    add: 'Add',
    batch: 'Several changes',
    patch: 'Edit',
    remove: 'Remove',
    replace: 'Replace',
    unknown: 'Change'
  },
  target: {
    memory: 'Memory',
    user: 'User profile'
  },
  background: 'Background review',
  backgroundTip: 'Hermes suggested this on its own after a chat, not while answering you.',
  maybeCut: 'Hermes only sends the start of this text, so the end may be missing.',
  entryLabel: (action: string) =>
    action === 'remove' ? 'Removes this memory' : action === 'add' ? 'Adds this memory' : 'Changes this memory',
  unpinned:
    "This was saved by an older version of Hermes and doesn't say which memory it changes. Reject it and ask Hermes again.",
  emptyTitle: 'No pending memories',
  emptyOn: 'When Hermes wants to save a memory and no one is there to answer, it waits here.',
  emptyOff:
    'Ask before saving memories is off, so Hermes saves memories without asking. Removals that Hermes suggests on its own still wait here.',
  loadFailed: "Couldn't load pending memories",
  unreadable: "Hermes sent a reply this page couldn't read:"
}

type MemoryReviewMessages = typeof en

export const MEMORY_REVIEW_LOCALES: PluginLocaleBundles = { en }

type Bound<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends object
      ? Bound<T[K]>
      : string
}

function bind<T extends object>(t: PluginTranslate, template: T, prefix = ''): Bound<T> {
  const out = {} as Record<string, unknown>

  for (const [key, value] of Object.entries(template)) {
    const path = prefix ? `${prefix}.${key}` : key
    out[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => t(path, ...args)
        : value && typeof value === 'object'
          ? bind(t, value as object, path)
          : t(path)
  }

  return out as Bound<T>
}

export type MemoryReviewText = Bound<MemoryReviewMessages>

export function useMemoryReviewText(): MemoryReviewText {
  const t = usePluginI18n('memory-review')

  return useMemo(() => bind(t, en), [t])
}
