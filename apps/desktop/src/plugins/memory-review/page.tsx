import {
  Button,
  Codicon,
  ConfirmDialog,
  PanelBlock,
  PanelEmpty,
  PanelPill,
  PanelSectionLabel,
  Switch,
  Tip,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import { useState } from 'react'

import { $reviewSessionId, fetchReview, reviewKey, runMemoryCommand } from './api'
import { type MemoryReviewText, useMemoryReviewText } from './i18n'
import { parseApprovalReply, type PendingMemoryWrite, replyFailed } from './parse'

interface Reply {
  failed: boolean
  text: string
}

type Busy = null | string

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
        <PanelPill tone={write.action === 'remove' ? 'warn' : 'muted'}>{text.action[write.action]}</PanelPill>
        {write.target && <PanelPill>{text.target[write.target]}</PanelPill>}
        {write.background && (
          <Tip label={text.backgroundTip}>
            <span>
              <PanelPill tone="good">{text.background}</PanelPill>
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
          {text.reject}
        </Button>
        <Button disabled={busy !== null} onClick={onApprove} size="sm">
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

  const query = useQuery({
    queryFn: () => fetchReview(sessionId),
    queryKey: reviewKey(sessionId)
  })

  const review = query.data?.kind === 'review' ? query.data.review : null
  const writes = review?.writes ?? []

  const run = async (key: string, args: string) => {
    setBusy(key)

    try {
      const output = await runMemoryCommand(sessionId, args)
      setReply({ failed: replyFailed(output), text: output })
    } catch (error) {
      setReply({ failed: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
      await queryClient.invalidateQueries({ queryKey: reviewKey(sessionId) })
    }
  }

  const setApproval = async (on: boolean) => {
    setBusy('approval')

    try {
      const output = await runMemoryCommand(sessionId, `approval ${on ? 'on' : 'off'}`)

      if (parseApprovalReply(output) === null) {
        setReply({ failed: true, text: output })
      }
    } catch (error) {
      setReply({ failed: true, text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(null)
      await queryClient.invalidateQueries({ queryKey: reviewKey(sessionId) })
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
            onApprove={() => void run(write.id, `approve ${write.id}`)}
            onReject={() => void run(write.id, `reject ${write.id}`)}
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
                onCheckedChange={on => void setApproval(on)}
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
        onConfirm={() => run(`${confirm}-all`, `${confirm} all`)}
        open={confirm !== null}
        title={confirm === 'reject' ? text.rejectAllTitle(writes.length) : text.approveAllTitle(writes.length)}
      />
    </div>
  )
}
