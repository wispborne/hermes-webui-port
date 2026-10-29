import { useStore } from '@nanostores/react'
import type { MemoryWriteEntry, PendingMemoryWrite } from '@hermes/memory-review/parse'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Switch,
  Text
} from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import {
  $memoryReview,
  $memoryReviewBusy,
  $memoryReviewError,
  $memoryReviewLoading,
  $memoryReviewReply,
  dismissMemoryReviewReply,
  reloadMemoryReview,
  runMemoryCommand
} from '@/store/memory-review'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

type TagTone = 'good' | 'muted' | 'warn'

function Tag({ label, tone = 'muted' }: { label: string; tone?: TagTone }) {
  const { colors } = useHermesTheme()

  const [background, foreground] = {
    good: [colors.primaryContainer, colors.onPrimaryContainer],
    muted: [colors.surfaceVariant, colors.onSurfaceVariant],
    warn: [colors.errorContainer, colors.onErrorContainer]
  }[tone]

  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <Text style={{ color: foreground }} variant="labelSmall">
        {label}
      </Text>
    </View>
  )
}

function TextBlock({ children }: { children: string }) {
  const { colors } = useHermesTheme()

  return (
    <Text selectable style={[styles.mono, { backgroundColor: colors.surfaceVariant, color: colors.onSurface }]}>
      {children}
    </Text>
  )
}

const entryLabel = (entry: MemoryWriteEntry) =>
  entry.action === 'remove'
    ? t('app.memoryReview.entryRemoves')
    : entry.action === 'add'
      ? t('app.memoryReview.entryAdds')
      : t('app.memoryReview.entryChanges')

function WriteCard({ write }: { write: PendingMemoryWrite }) {
  const { colors } = useHermesTheme()
  const busy = useStore($memoryReviewBusy)
  const online = useConnectionStatus() === 'open'
  const disabled = !online || busy !== null

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}
      testID={`memory-${write.id}`}
    >
      <View style={styles.tags}>
        <Tag label={t(`app.memoryReview.action.${write.action}`)} tone={write.action === 'remove' ? 'warn' : 'muted'} />
        {write.target ? <Tag label={t(`app.memoryReview.target.${write.target}`)} /> : null}
        {write.background ? <Tag label={t('app.memoryReview.background')} tone="good" /> : null}
        <Text style={[styles.id, { color: colors.onSurfaceVariant }]} variant="labelSmall">
          {write.id}
        </Text>
      </View>
      <TextBlock>{write.maybeCut ? `${write.detail}…` : write.detail}</TextBlock>
      {write.maybeCut ? (
        <Text style={{ color: colors.onSurfaceVariant }} variant="bodySmall">
          {t('app.memoryReview.maybeCut')}
        </Text>
      ) : null}
      {write.entries.map((entry, index) => (
        <View key={index} style={styles.entryInCard}>
          <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
            {entryLabel(entry)}
          </Text>
          {entry.text === null ? (
            <Text style={{ color: colors.error }} variant="bodySmall">
              {t('app.memoryReview.unpinned')}
            </Text>
          ) : (
            <TextBlock>{entry.text}</TextBlock>
          )}
        </View>
      ))}
      <View style={styles.buttons}>
        <Button
          compact
          disabled={disabled}
          loading={busy === `reject ${write.id}`}
          mode="outlined"
          onPress={() => void runMemoryCommand(`reject ${write.id}`)}
          testID={`reject-${write.id}`}
          textColor={colors.error}
        >
          {t('app.memoryReview.reject')}
        </Button>
        <Button
          compact
          disabled={disabled}
          loading={busy === `approve ${write.id}`}
          mode="contained"
          onPress={() => void runMemoryCommand(`approve ${write.id}`)}
          testID={`approve-${write.id}`}
        >
          {t('app.memoryReview.approve')}
        </Button>
      </View>
    </View>
  )
}

function Empty({ icon, text, title }: { icon: string; text?: string; title?: string }) {
  const { colors } = useHermesTheme()

  return (
    <View style={styles.empty}>
      <Icon color={colors.onSurfaceVariant} size={24} source={icon} />
      {title ? <Text variant="titleSmall">{title}</Text> : null}
      {text ? (
        <Text style={[styles.centered, { color: colors.onSurfaceVariant }]} variant="bodySmall">
          {text}
        </Text>
      ) : null}
    </View>
  )
}

/** Pending memories: approve or reject each, approve or reject all, and the approval switch. */
export function MemoryReviewScreen() {
  const { colors } = useHermesTheme()
  const answer = useStore($memoryReview)
  const loading = useStore($memoryReviewLoading)
  const error = useStore($memoryReviewError)
  const reply = useStore($memoryReviewReply)
  const busy = useStore($memoryReviewBusy)
  const online = useConnectionStatus() === 'open'
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)
  const scroll = useRef<ScrollView>(null)

  // A reply belongs to the visit it came from, as on the web page.
  useFocusEffect(
    useCallback(() => {
      dismissMemoryReviewReply()
      void reloadMemoryReview()
    }, [])
  )

  // Load once the connection opens, when the screen was opened before it did.
  useEffect(() => {
    if (online) {
      void reloadMemoryReview()
    }
  }, [online])

  // The reply sits above the cards; show it after acting on a card further down.
  useEffect(() => {
    if (reply) {
      scroll.current?.scrollTo({ animated: true, y: 0 })
    }
  }, [reply])

  const review = answer?.kind === 'review' ? answer.review : null
  const writes = review?.writes ?? []
  const disabled = !online || busy !== null

  let body

  if (answer?.kind === 'unreadable') {
    body = (
      <View style={styles.entry}>
        <Text style={{ color: colors.onSurfaceVariant }} variant="bodySmall">
          {t('app.memoryReview.unreadable')}
        </Text>
        <TextBlock>{answer.text}</TextBlock>
      </View>
    )
  } else if (!answer && error) {
    body = <Empty icon="alert-circle-outline" text={error} title={t('app.memoryReview.loadFailed')} />
  } else if (!answer) {
    body = <ActivityIndicator style={styles.loading} />
  } else if (writes.length === 0) {
    body = (
      <Empty
        icon="check"
        text={review?.approvalOn === false ? t('app.memoryReview.emptyOff') : t('app.memoryReview.emptyOn')}
        title={t('app.memoryReview.emptyTitle')}
      />
    )
  } else {
    body = writes.map(write => <WriteCard key={write.id} write={write} />)
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/sessions'))} />
        <Appbar.Content title={t('app.memoryReview.title')} />
        <Appbar.Action
          accessibilityLabel={t('app.memoryReview.refresh')}
          disabled={!online || loading}
          icon="refresh"
          onPress={() => void reloadMemoryReview()}
        />
        {writes.length > 1 ? (
          <Menu
            anchor={
              <Appbar.Action
                accessibilityLabel={t('app.memoryReview.more')}
                icon="dots-vertical"
                onPress={() => setMenuOpen(true)}
                testID="memory-menu"
              />
            }
            onDismiss={() => setMenuOpen(false)}
            visible={menuOpen}
          >
            <Menu.Item
              disabled={disabled}
              onPress={() => {
                setMenuOpen(false)
                setConfirm('approve')
              }}
              testID="approve-all"
              title={t('app.memoryReview.approveAll')}
            />
            <Menu.Item
              disabled={disabled}
              onPress={() => {
                setMenuOpen(false)
                setConfirm('reject')
              }}
              testID="reject-all"
              title={t('app.memoryReview.rejectAll')}
            />
          </Menu>
        ) : null}
      </Appbar.Header>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.list}
        ref={scroll}
        refreshControl={
          <RefreshControl onRefresh={() => void reloadMemoryReview()} refreshing={loading && answer !== null} />
        }
      >
        {review && review.approvalOn !== null ? (
          <List.Item
            description={t('app.memoryReview.approvalHelp')}
            descriptionNumberOfLines={4}
            disabled={disabled}
            onPress={() => void runMemoryCommand(`approval ${review.approvalOn ? 'off' : 'on'}`)}
            right={() => (
              <Switch
                disabled={disabled}
                onValueChange={on => void runMemoryCommand(`approval ${on ? 'on' : 'off'}`)}
                testID="memory-approval"
                value={review.approvalOn ?? false}
              />
            )}
            title={t('app.memoryReview.approval')}
          />
        ) : null}
        {reply ? (
          <View
            style={[
              styles.card,
              reply.failed
                ? { backgroundColor: colors.errorContainer, borderColor: colors.error }
                : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }
            ]}
            testID="memory-reply"
          >
            <View style={styles.replyRow}>
              <Text
                selectable
                style={[styles.replyText, { color: reply.failed ? colors.onErrorContainer : colors.onSurface }]}
              >
                {reply.text}
              </Text>
              <IconButton
                accessibilityLabel={t('app.memoryReview.dismiss')}
                icon="close"
                onPress={dismissMemoryReviewReply}
                size={18}
                style={styles.close}
              />
            </View>
          </View>
        ) : null}
        {body}
      </ScrollView>
      <Portal>
        <Dialog onDismiss={() => setConfirm(null)} visible={confirm !== null}>
          <Dialog.Title>
            {confirm === 'reject'
              ? t('app.memoryReview.rejectAllTitle', { count: writes.length })
              : t('app.memoryReview.approveAllTitle', { count: writes.length })}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {confirm === 'reject' ? t('app.memoryReview.rejectAllBody') : t('app.memoryReview.approveAllBody')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button
              onPress={() => {
                const action = confirm
                setConfirm(null)
                void runMemoryCommand(`${action} all`)
              }}
              testID="confirm-all"
              textColor={confirm === 'reject' ? colors.error : undefined}
            >
              {confirm === 'reject' ? t('app.memoryReview.rejectAll') : t('app.memoryReview.approveAll')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: space.step * 2, justifyContent: 'flex-end' },
  card: { borderRadius: 12, borderWidth: 1, gap: space.listGap, marginHorizontal: space.screen, padding: space.screen },
  centered: { textAlign: 'center' },
  close: { margin: -8 },
  empty: { alignItems: 'center', gap: space.step * 2, padding: space.screen * 2 },
  entry: { gap: space.step, paddingHorizontal: space.screen },
  entryInCard: { gap: space.step },
  fill: { flex: 1 },
  id: { fontFamily: 'monospace', marginLeft: 'auto' },
  list: { gap: space.listGap, paddingBottom: space.screen * 2 },
  loading: { padding: space.screen * 2 },
  mono: { borderRadius: 6, fontFamily: 'monospace', fontSize: 13, padding: space.listGap },
  replyRow: { alignItems: 'flex-start', flexDirection: 'row', gap: space.step * 2 },
  replyText: { flex: 1, fontFamily: 'monospace', fontSize: 12 },
  tag: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  tags: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space.step }
})
