import { useStore } from '@nanostores/react'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Button, IconButton, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { ChatItem } from '@/chat/items'
import { type OutboxActions, TranscriptItem } from '@/components/chat/transcript-items'
import { OfflineBanner } from '@/components/offline-banner'
import { sessionHeading } from '@/components/session-list-row'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import {
  cancelOutboxMessage,
  chatStore,
  closeChat,
  confirmOldOutboxMessage,
  loadEarlier,
  newLocalKey,
  openChat,
  sendMessage,
  stopTurn
} from '@/store/chat'
import { $sessionRows } from '@/store/sessions'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

export interface SessionScreenProps {
  /** A stored session id, or "new" for a session that starts with its first message. */
  id: string
  /** Shown between the transcript and the message box. The approvals change puts its cards here. */
  aboveComposer?: (key: string) => React.ReactNode
}

/** A session: its transcript, and the message box with Send, or Stop while a turn runs. */
export function SessionScreen({ aboveComposer, id }: SessionScreenProps) {
  const { colors } = useHermesTheme()
  const [key] = useState(() => (id === 'new' ? newLocalKey() : id))
  const chat = useStore(chatStore(key))
  const rows = useStore($sessionRows)
  const status = useConnectionStatus()
  const [draft, setDraft] = useState('')
  const list = useRef<FlashListRef<ChatItem>>(null)

  useEffect(() => {
    void openChat(key).catch((error: unknown) => console.warn('Could not open the session', error))

    return () => closeChat(key)
  }, [key])

  // A new session was created on the gateway: move to its own route.
  useEffect(() => {
    if (key.startsWith('local-') && chat.storedId) {
      router.replace({ pathname: '/session/[id]', params: { id: chat.storedId } })
    }
  }, [chat.storedId, key])

  const actions = useMemo<OutboxActions>(
    () => ({
      offline: status !== 'open',
      onCancel: outboxId => void cancelOutboxMessage(key, outboxId),
      onSendNow: outboxId => confirmOldOutboxMessage(key, outboxId)
    }),
    [key, status]
  )

  const row = rows.find(found => found.id === chat.storedId)
  const title = chat.title ?? (row ? sessionHeading(row) : id === 'new' ? t('sidebar.nav.new-session') : '')
  const canSend = draft.trim() !== ''

  const send = () => {
    const text = draft.trim()

    if (text) {
      setDraft('')
      void sendMessage(key, text).then(() => list.current?.scrollToEnd({ animated: true }))
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/sessions'))} />
        <Appbar.Content title={title} titleStyle={styles.title} />
      </Appbar.Header>
      <OfflineBanner />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={styles.fill}>
          {chat.transcript === 'loading' && chat.items.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator accessibilityLabel={t('assistant.thread.loadingSession')} />
            </View>
          ) : chat.transcript === 'not-saved' && chat.items.length === 0 ? (
            <View style={styles.center}>
              <Text style={[styles.centerText, { color: colors.onSurfaceVariant }]} variant="bodyMedium">
                {t('app.chat.notSaved')}
              </Text>
            </View>
          ) : (
            <FlashList
              data={chat.items}
              keyExtractor={item => item.key}
              keyboardShouldPersistTaps="handled"
              ref={list}
              ListFooterComponent={
                chat.running ? (
                  <View style={styles.status}>
                    <ActivityIndicator size={12} />
                    <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
                      {chat.status ?? t('assistant.thread.thinking')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.footerSpace} />
                )
              }
              ListHeaderComponent={
                chat.hasEarlier ? (
                  <Button compact loading={chat.loadingEarlier} onPress={() => void loadEarlier(key)} style={styles.earlier}>
                    {t('assistant.thread.showEarlier')}
                  </Button>
                ) : null
              }
              maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
              renderItem={({ item }) => <TranscriptItem actions={actions} item={item} />}
            />
          )}
        </View>
        {aboveComposer?.(key)}
        <View style={[styles.composer, { borderColor: colors.outline }]}>
          <TextInput
            dense
            mode="outlined"
            multiline
            onChangeText={setDraft}
            placeholder={chat.items.length ? t('composer.placeholderFollowUp') : t('composer.message')}
            style={styles.input}
            testID="message-box"
            value={draft}
          />
          {chat.running && !canSend ? (
            <IconButton
              accessibilityLabel={t('composer.stop')}
              containerColor={colors.errorContainer}
              icon="stop"
              iconColor={colors.error}
              mode="contained"
              onPress={() => void stopTurn(key)}
              testID="stop"
            />
          ) : (
            <IconButton
              accessibilityLabel={t('composer.send')}
              disabled={!canSend}
              icon="send"
              mode="contained"
              onPress={send}
              testID="send"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: space.screen * 2 },
  centerText: { textAlign: 'center' },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.step,
    paddingHorizontal: space.listGap,
    paddingVertical: space.step
  },
  earlier: { alignSelf: 'center', marginVertical: space.step },
  fill: { flex: 1 },
  footerSpace: { height: space.listGap },
  input: { flex: 1, maxHeight: 160 },
  status: { alignItems: 'center', flexDirection: 'row', gap: space.listGap, paddingHorizontal: space.screen, paddingVertical: space.listGap },
  title: { fontSize: 16 }
})
