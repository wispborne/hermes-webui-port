/**
 * Memory review — a page for the memory writes Hermes is holding for approval
 * (`memory.write_approval`), plus a sidebar entry, a status bar count, and rows
 * in Settings ▸ Memory & Context. Everything goes through the gateway's
 * `/memory` command, read by ./parse.
 *
 * Not from upstream: this folder exists only in this repo, so upstream syncs
 * merge around it. The one upstream edit it needs is the settings slot in
 * app/settings/config-settings.tsx.
 */

import {
  cn,
  Codicon,
  type HermesPlugin,
  host,
  PALETTE_AREA,
  type PaletteContribution,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution,
  STATUSBAR_AREAS,
  Tip,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'

import { $reviewSessionId, fetchReview, reviewKey, trackReviewSession } from './api'
import { MEMORY_REVIEW_LOCALES, useMemoryReviewText } from './i18n'
import { MemoryReviewPage } from './page'
import { MemorySettingsRows } from './settings-rows'

const PATH = '/memory-review'

// Shown only when something is waiting. Shares the page's query, so one poll
// serves both.
function PendingCount() {
  const text = useMemoryReviewText()
  const sessionId = useValue($reviewSessionId)
  const gateway = useValue(host.state.gateway)

  const { data } = useQuery({
    enabled: gateway === 'open',
    queryFn: () => fetchReview(sessionId),
    queryKey: reviewKey(sessionId),
    refetchInterval: 60_000
  })

  const count = data?.kind === 'review' ? data.review.writes.length : 0

  if (count === 0) {
    return null
  }

  return (
    <Tip label={text.countTip(count)}>
      <button
        className={cn(
          'inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] tabular-nums transition-colors',
          'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
        )}
        onClick={() => host.navigate(PATH)}
        type="button"
      >
        <Codicon name="lightbulb" size="0.7rem" />
        <span>{count}</span>
      </button>
    </Tip>
  )
}

const plugin: HermesPlugin = {
  id: 'memory-review',
  name: 'Memory review',
  description: 'Review the memories Hermes is waiting to save: approve or reject each one.',
  register(ctx) {
    ctx.i18n.register(MEMORY_REVIEW_LOCALES)
    ctx.onDispose(trackReviewSession())

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: PATH } satisfies RouteContribution,
        render: () => <MemoryReviewPage />
      },
      {
        id: 'count',
        area: STATUSBAR_AREAS.right,
        order: 81,
        render: () => <PendingCount />
      },
      {
        // The slot this repo adds to upstream's config-settings.tsx.
        id: 'settings',
        area: 'settings.config.memory.persistent',
        render: () => <MemorySettingsRows path={PATH} />
      }
    ])

    const registerLabels = () =>
      ctx.registerMany([
        {
          id: 'nav',
          area: SIDEBAR_NAV_AREA,
          order: 55,
          data: { codicon: 'lightbulb', label: ctx.i18n.t('nav'), path: PATH } satisfies SidebarNavContribution
        },
        {
          id: 'open',
          area: PALETTE_AREA,
          data: {
            id: 'memory-review.open',
            label: ctx.i18n.t('openPage'),
            keywords: ['memory', 'memories', 'pending', 'approve', 'reject', 'review'],
            run: () => host.navigate(PATH)
          } satisfies PaletteContribution
        }
      ])

    let disposeLabels = registerLabels()
    ctx.i18n.onLocaleChange(() => {
      disposeLabels()
      disposeLabels = registerLabels()
    })
  }
}

export default plugin
