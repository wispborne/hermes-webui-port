import {
  Button,
  Codicon,
  ConfirmDialog,
  cn,
  PanelBlock,
  PanelEmpty,
  PanelSectionLabel,
  Switch,
  Tip,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import { useCallback, useState } from 'react'

import { $reviewSessionId, fetchReview, reviewKey, runMemoryCommand } from './api'
import { type MemoryReviewText, useMemoryReviewText } from './i18n'
import { parseApprovalReply, type PendingMemoryWrite, replyFailed } from './parse'

interface Reply {
  failed: boolean
  text: string
}

type Busy = null | string

const TAG_TONE = {
  good: 'bg-primary/10 text-primary',
  muted: 'bg-foreground/10 text-muted-foreground',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
}

// PanelPill's look without its `capitalize`, which turned "User profile" into
// "User Profile".
function Tag({ children, tone = 'muted' }: { children: string; tone?: keyof typeof TAG_TONE }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.62rem] font-medium', TAG_TONE[tone])}
    >
      {children}
    </span>
  )
}

function WriteCard({
  busy,
  onApprove,
  onReject,
  text,
  write
}: {
  busy: Busy
  onApprove: () => void
  onReject: () => void
  text: MemoryReviewText
  write: PendingMemoryWrite
}) {
  return (
    <li className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag tone={write.action === 'remove' ? 'warn' : 'muted'}>{text.action[write.action]}</Tag>
        {write.target && <Tag>{text.target[write.target]}</Tag>}
        {write.background && (
          <Tip label={text.backgroundTip}>
            <span>
              <Tag tone="good">{text.background}</Tag>
            </span>
          </Tip>
        )}
        <span className="ml-auto font-mono text-[0.625rem] text-(--ui-text-tertiary)">{write.id}</span>
      </div>

      <PanelBlock className="mt-2 max-h-64">
        {write.detail}
        {write.maybeCut && '…'}
      </PanelBlock>
      {write.maybeCut && <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">{text.maybeCut}</p>}

      {write.entries.map((entry, index) => (
        <div className="mt-3" key={index}>
          <PanelSectionLabel>{text.entryLabel(entry.action)}</PanelSectionLabel>
          {entry.text === null ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">{text.unpinned}</p>
          ) : (
            <PanelBlock className="mt-1 max-h-64">{entry.text}</PanelBlock>
          )}
        </div>
      ))}

      <div className="mt-3 flex justify-end gap-1.5">
        <Button disabled={busy !== null} onClick={onReject} size="sm" variant="ghost">
          {busy === `reject ${write.id}` && <Codicon name="loading" size="0.875rem" spinning />}
          {text.reject}
        </Button>
        <Button disabled={busy !== null} onClick={onApprove} size="sm">
          {busy === `approve ${write.id}` && <Codicon name="loading" size="0.875rem" spinning />}
          {text.approve}
        </Button>
      </div>
    </li>
  )
}

export function MemoryReviewPage() {
  const text = useMemoryReviewText()
  const sessionId = useValue($reviewSessionId)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<Busy>(null)
  const [reply, setReply] = useState<null | Reply>(null)
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)

  // The reply box sits above the list; bring it into view when it appears
  // after acting on a card further down. Stable, so it runs once per reply.
  const revealReply = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const query = useQuery({
    queryFn: () => fetchReview(sessionId),
    queryKey: reviewKey(sessionId)
  })

  const review = query.data?.kind === 'review' ? query.data.review : null
  const writes = review?.writes ?? []

  // `args` doubles as the busy key, so the pressed button can show a spinner.
  const run = async (args: string) => {
    setBusy(args)
    setReply(null)

    try {
      const output = await runMemoryCommand(sessionId, args)

      if (args.startsWith('approval ')) {
        if (parseApprovalReply(output) === null) {
          setReply({ failed: true, text: output })
        }
      } else {
        setReply({ failed: replyFailed(output), text: output })
      }
    } catch (error) {
      setReply({ failed: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      await queryClient.invalidateQueries({ queryKey: reviewKey(sessionId) })
      setBusy(null)
    }
  }

  let body

  if (query.isPending) {
    body = <PanelEmpty icon="loading~spin" />
  } else if (query.isError) {
    body = (
      <PanelEmpty
        action={
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">
            {text.refresh}
          </Button>
        }
        description={query.error instanceof Error ? query.error.message : String(query.error)}
        icon="warning"
        title={text.loadFailed}
      />
    )
  } else if (query.data?.kind === 'unreadable') {
    body = (
      <div className="space-y-2">
        <p className="text-xs text-(--ui-text-secondary)">{text.unreadable}</p>
        <PanelBlock className="max-h-96">{query.data.text}</PanelBlock>
      </div>
    )
  } else if (writes.length === 0) {
    body = (
      <PanelEmpty
        description={review?.approvalOn === false ? text.emptyOff : text.emptyOn}
        icon="check"
        title={text.emptyTitle}
      />
    )
  } else {
    body = (
      <ul className="space-y-3">
        {writes.map(write => (
          <WriteCard
            busy={busy}
            key={write.id}
            onApprove={() => void run(`approve ${write.id}`)}
            onReject={() => void run(`reject ${write.id}`)}
            text={text}
            write={write}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--ui-surface-background)">
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2">
        <h1 className="text-sm font-semibold text-foreground">{text.title}</h1>
        {writes.length > 0 && (
          <span className="rounded-full bg-(--ui-bg-quaternary) px-1.5 py-px text-[0.625rem] tabular-nums text-(--ui-text-tertiary)">
            {writes.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {writes.length > 1 && (
            <>
              <Button disabled={busy !== null} onClick={() => setConfirm('reject')} size="sm" variant="ghost">
                {text.rejectAll}
              </Button>
              <Button disabled={busy !== null} onClick={() => setConfirm('approve')} size="sm" variant="outline">
                {text.approveAll}
              </Button>
            </>
          )}
          <Tip label={text.refresh}>
            <Button
              aria-label={text.refresh}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              size="icon-sm"
              variant="ghost"
            >
              <Codicon name="refresh" size="0.875rem" spinning={query.isFetching} />
            </Button>
          </Tip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {review && review.approvalOn !== null && (
            <label className="flex items-start gap-3 rounded-lg border border-(--ui-stroke-tertiary) p-3">
              <Switch
                checked={review.approvalOn}
                className="mt-0.5"
                disabled={busy !== null}
                onCheckedChange={on => void run(`approval ${on ? 'on' : 'off'}`)}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{text.approval}</span>
                <span className="block text-[0.6875rem] leading-relaxed text-(--ui-text-tertiary)">
                  {text.approvalHelp}
                </span>
              </span>
            </label>
          )}

          {reply && (
            <div
              ref={revealReply}
              className={
                reply.failed
                  ? 'rounded-lg border border-destructive/30 bg-destructive/5 p-3'
                  : 'rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-3'
              }
            >
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[0.6875rem] leading-relaxed text-foreground/85">
                  {reply.text}
                </pre>
                <Tip label={text.dismiss}>
                  <Button aria-label={text.dismiss} onClick={() => setReply(null)} size="icon-sm" variant="ghost">
                    <Codicon name="close" size="0.875rem" />
                  </Button>
                </Tip>
              </div>
            </div>
          )}

          {body}
        </div>
      </div>

      <ConfirmDialog
        confirmLabel={confirm === 'reject' ? text.rejectAll : text.approveAll}
        description={confirm === 'reject' ? text.rejectAllBody : text.approveAllBody}
        destructive={confirm === 'reject'}
        dismissOnConfirm
        onClose={() => setConfirm(null)}
        onConfirm={() => run(`${confirm} all`)}
        open={confirm !== null}
        title={confirm === 'reject' ? text.rejectAllTitle(writes.length) : text.approveAllTitle(writes.length)}
      />
    </div>
  )
}
