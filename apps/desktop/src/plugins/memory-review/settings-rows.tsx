import { Button, host, ListRow, ToggleRow, useQuery, useQueryClient, useValue } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { $reviewSessionId, fetchReview, reviewKey, runMemoryCommand } from './api'
import { useMemoryReviewText } from './i18n'
import { parseApprovalReply } from './parse'

/**
 * Rows for Settings ▸ Memory & Context ▸ Persistent memory, through the
 * `settings.config.memory.persistent` slot: the approval switch and the way
 * into the Memory review page. Same as the phone's Memory & Context page.
 */
export function MemorySettingsRows({ path }: { path: string }) {
  const text = useMemoryReviewText()
  const sessionId = useValue($reviewSessionId)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const { data } = useQuery({
    queryFn: () => fetchReview(sessionId),
    queryKey: reviewKey(sessionId)
  })

  const review = data?.kind === 'review' ? data.review : null
  const count = review?.writes.length ?? 0

  const setApproval = async (on: boolean) => {
    setBusy(true)
    setError(null)

    try {
      const output = await runMemoryCommand(sessionId, `approval ${on ? 'on' : 'off'}`)

      if (parseApprovalReply(output) === null) {
        setError(output)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      await queryClient.invalidateQueries({ queryKey: reviewKey(sessionId) })
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1">
      {review && review.approvalOn !== null && (
        <ToggleRow
          below={error ? <p className="mt-1 text-xs text-destructive">{error}</p> : undefined}
          checked={review.approvalOn}
          description={text.approvalHelp}
          disabled={busy}
          label={text.approval}
          onChange={on => void setApproval(on)}
        />
      )}
      <ListRow
        action={
          <Button onClick={() => host.navigate(path)} size="sm" variant="outline">
            {text.review}
          </Button>
        }
        description={count > 0 ? text.waiting(count) : text.noneWaiting}
        title={text.title}
      />
    </div>
  )
}
