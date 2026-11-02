import { useStore } from '@nanostores/react'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Button, IconButton, Snackbar, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { type DisplayItem, displayItems } from '@/chat/activity'
import { type Attachment, discardAttachment } from '@/chat/attachments'
import { pickFiles, pickPhotos, takePhoto } from '@/chat/pick-attachments'
import { turnEnds } from '@/chat/turns'
import { askBackgroundPermissions } from '@/background/permission-dialogs'
import { $onScreen } from '@/background/wiring'
import { AttachDialog, type AttachSource, PendingAttachments } from '@/components/chat/composer-attachments'
import { PromptCards } from '@/components/chat/prompt-cards'
import { type OutboxActions, TranscriptItem } from '@/components/chat/transcript-items'
import { OfflineBanner } from '@/components/offline-banner'
import { sessionHeading } from '@/components/session-list-row'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { useFollowBottom } from '@/hooks/use-follow-bottom'
import { t } from '@/i18n/t'
import {
  cancelOutboxMessage,
  chatStore,
  closeChat,
  confirmOldOutboxMessage,
  loadEarlier,
  newLocalKey,
  openChat,
  retryTurn,
  sendMessage,
  stopTurn
} from '@/store/chat'
import { loadAppSettings } from '@/storage/app-settings'
import { $prompts } from '@/store/prompts'
import { $sessionRows } from '@/store/sessions'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

export interface SessionScreenProps {
  /** A stored session id, or "new" for a session that starts with its first message. */
  id: string
}

/** A session: its transcript, and the message box with Send, and Stop while a turn runs. */
export function SessionScreen({ id }: SessionScreenProps) {
  const { colors } = useHermesTheme()
  const [key] = useState(() => (id === 'new' ? newLocalKey() : id))
  const chat = useStore(chatStore(key))
  const rows = useStore($sessionRows)
  const status = useConnectionStatus()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<Attachment[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // While a Question is open, it's answered in its card, and the message box waits.
  const answering = Boolean(useStore($prompts)[key]?.question)
  const list = useRef<FlashListRef<DisplayItem>>(null)
  const { follow, listProps } = useFollowBottom(list)
  const shownBefore = useRef<ReadonlyMap<string, DisplayItem>>(new Map())
  const shown = useMemo(() => {
    const next = displayItems(chat.items, chat.running, shownBefore.current)
    shownBefore.current = new Map(next.map(item => [item.key, item]))

    return next
  }, [chat.items, chat.running])

  useEffect(() => {
    void openChat(key).catch((error: unknown) => console.warn('Could not open the session', error))
    $onScreen.set(key)

    return () => {
      closeChat(key)

      if ($onScreen.get() === key) {
        $onScreen.set(null)
      }
    }
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

  // Each finished turn's last reply gets Copy; the last one also gets Retry.
  const ends = useMemo(() => turnEnds(shown, chat.running), [shown, chat.running])
  const lastEnd = useMemo(() => {
    const key = chat.running ? undefined : [...ends.keys()].at(-1)
    const at = shown.findIndex(item => item.key === key)

    // Only when that reply answers the last message sent.
    return key && shown.findLastIndex(item => item.kind === 'user') < at ? key : null
  }, [chat.running, ends, shown])
  const retry = useCallback(() => void retryTurn(key).then(follow), [follow, key])
  const row = rows.find(found => found.id === chat.storedId)
  const title = chat.title ?? (row ? sessionHeading(row) : id === 'new' ? t('sidebar.nav.new-session') : '')
  const canSend = !answering && (draft.trim() !== '' || pending.length > 0)

  const attachFrom = async (source: AttachSource) => {
    setAttachOpen(false)

    try {
      const picked = await (source === 'photos' ? pickPhotos() : source === 'camera' ? takePhoto() : pickFiles())

      if (picked === null) {
        setNotice(t('app.chat.cameraRefused'))
      } else {
        setPending(current => [...current, ...picked])
      }
    } catch (error) {
      console.warn('Could not add the attachment', error)
      setNotice(t('app.chat.attachFailed'))
    }
  }

  const remove = (attachment: Attachment) => {
    setPending(current => current.filter(found => found.uri !== attachment.uri))
    discardAttachment(attachment)
  }

  const send = () => {
    const text = draft.trim()

    if (text || pending.length) {
      setDraft('')
      setPending([])
      void sendMessage(key, text, pending).then(follow)

      // The first message is when background use starts to matter: explain and ask once.
      if (!loadAppSettings().backgroundAsked) {
        void askBackgroundPermissions()
      }
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
              data={shown}
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
              maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
              {...listProps}
              renderItem={({ item }) => (
                <TranscriptItem actions={actions} item={item} onRetry={item.key === lastEnd ? retry : undefined} turnText={ends.get(item.key)} />
              )}
            />
          )}
        </View>
        <PromptCards sessionKey={key} />
        <PendingAttachments attachments={pending} onRemove={remove} />
        <View style={[styles.composer, { borderColor: colors.outline }]}>
          <IconButton
            accessibilityLabel={t('app.chat.attach')}
            disabled={answering}
            icon="paperclip"
            onPress={() => setAttachOpen(true)}
            style={styles.composerButton}
            testID="attach"
          />
          <TextInput
            autoFocus={id === 'new'}
            contentStyle={styles.inputText}
            dense
            editable={!answering}
            mode="outlined"
            multiline
            onChangeText={setDraft}
            placeholder={
              answering ? t('app.chat.answerAbove') : chat.items.length ? t('composer.placeholderFollowUp') : t('composer.message')
            }
            style={styles.input}
            testID="message-box"
            value={draft}
          />
          {chat.running ? (
            <IconButton
              accessibilityLabel={t('composer.stop')}
              containerColor={colors.errorContainer}
              icon="stop"
              iconColor={colors.error}
              mode="contained"
              onPress={() => void stopTurn(key)}
              style={styles.composerButton}
              testID="stop"
            />
          ) : null}
          {!chat.running || canSend ? (
            <IconButton
              accessibilityLabel={t('composer.send')}
              disabled={!canSend}
              icon="send"
              mode="contained"
              onPress={send}
              style={styles.composerButton}
              testID="send"
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
      <AttachDialog onChoose={source => void attachFrom(source)} onDismiss={() => setAttachOpen(false)} visible={attachOpen} />
      <Snackbar duration={4000} onDismiss={() => setNotice(null)} visible={notice !== null}>
        {notice ?? ''}
      </Snackbar>
    </SafeAreaView>
  )
}

/** Paper's height for a dense outlined text box. */
const INPUT_HEIGHT = 48
/** Paper's IconButton without its margin. */
const COMPOSER_BUTTON_SIZE = 40
/** Centers one 20 dp line of text in the box. */
const INPUT_TEXT_PADDING = (INPUT_HEIGHT - 20) / 2

const styles = StyleSheet.create({
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: space.screen * 2 },
  centerText: { textAlign: 'center' },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.listGap,
    paddingHorizontal: space.listGap,
    paddingVertical: space.listGap
  },
  // Paper's buttons have a 6 dp margin. Without it, the button lines up with the box's edges.
  composerButton: { margin: 0, marginBottom: (INPUT_HEIGHT - COMPOSER_BUTTON_SIZE) / 2 },
  earlier: { alignSelf: 'center', marginVertical: space.step },
  fill: { flex: 1 },
  footerSpace: { height: space.listGap },
  input: { flex: 1, maxHeight: 160 },
  // On Android, Paper gives a multiline box without a label no top or bottom padding, so the text sat at the top.
  inputText: { paddingBottom: INPUT_TEXT_PADDING, paddingTop: INPUT_TEXT_PADDING },
  status: { alignItems: 'center', flexDirection: 'row', gap: space.listGap, paddingHorizontal: space.screen, paddingVertical: space.listGap },
  title: { fontSize: 16 }
})
