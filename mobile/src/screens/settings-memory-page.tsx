import { useStore } from '@nanostores/react'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { List, Switch } from 'react-native-paper'

import { SettingsPage } from '@/components/settings-page'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import {
  $memoryReview,
  $memoryReviewBusy,
  $pendingMemoryCount,
  reloadMemoryReview,
  runMemoryCommand
} from '@/store/memory-review'

/** Memory & Context: the approval switch, and the way into Memory review. */
export function MemoryPage() {
  const answer = useStore($memoryReview)
  const busy = useStore($memoryReviewBusy)
  const pending = useStore($pendingMemoryCount)
  const online = useConnectionStatus() === 'open'
  const approvalOn = answer?.kind === 'review' ? answer.review.approvalOn : null
  const disabled = !online || busy !== null || approvalOn === null

  useFocusEffect(
    useCallback(() => {
      void reloadMemoryReview()
    }, [])
  )

  useEffect(() => {
    if (online) {
      void reloadMemoryReview()
    }
  }, [online])

  const setApproval = (on: boolean) => void runMemoryCommand(`approval ${on ? 'on' : 'off'}`)

  return (
    <SettingsPage title={t('settings.sections.memory')}>
      <List.Item
        description={t('app.memoryReview.approvalHelp')}
        descriptionNumberOfLines={4}
        disabled={disabled}
        onPress={() => setApproval(!approvalOn)}
        right={() => (
          <Switch
            disabled={disabled}
            onValueChange={setApproval}
            testID="settings-memory-approval"
            value={approvalOn ?? false}
          />
        )}
        title={t('app.memoryReview.approval')}
      />
      <List.Item
        description={
          pending > 0 ? t('app.memoryReview.waiting', { count: pending }) : t('app.memoryReview.noneWaiting')
        }
        left={props => <List.Icon {...props} icon="lightbulb-outline" />}
        onPress={() => router.push('/memory-review')}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        testID="settings-pending-memories"
        title={t('app.memoryReview.title')}
      />
    </SettingsPage>
  )
}
