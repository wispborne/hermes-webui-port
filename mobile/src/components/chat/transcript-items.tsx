import { memo, useEffect, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Icon, Text } from 'react-native-paper'

import type { AssistantItem, ChatItem, NoteItem, ToolItem, UserItem } from '@/chat/items'
import { type MediaKind, mediaKind, mediaName, parseMediaSegments } from '@/chat/media'
import { loadMediaDataUrl } from '@/gateway/media-api'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

import { Markdown } from './markdown'

export interface OutboxActions {
  /** True while the gateway can't be reached. Waiting messages then say "Waiting to send". */
  offline: boolean
  onCancel: (outboxId: string) => void
  onSendNow: (outboxId: string) => void
}

function UserBubble({ actions, item }: { actions: OutboxActions; item: UserItem }) {
  const { colors } = useHermesTheme()
  const segments = useMemo(() => parseMediaSegments(item.text), [item.text])
  const waiting = item.state === 'waiting' && (actions.offline || item.sendFailed)

  return (
    <View style={styles.userRow}>
      <View
        style={[
          styles.userBubble,
          { backgroundColor: colors.userBubble, borderColor: colors.userBubbleBorder },
          item.state === 'waiting' || item.state === 'old' ? styles.faded : null
        ]}
      >
        {segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <Text key={index} selectable variant="bodyMedium">
              {segment.text}
            </Text>
          ) : (
            <Media key={index} path={segment.path} />
          )
        )}
      </View>
      {item.state === 'queued' ? <Label icon="clock" text={t('app.chat.queued')} /> : null}
      {waiting && item.outboxId ? (
        <View style={styles.outboxRow}>
          <Label icon="cloud-upload" text={t('app.chat.waitingToSend')} />
          <Button compact mode="text" onPress={() => actions.onCancel(item.outboxId!)}>
            {t('common.cancel')}
          </Button>
        </View>
      ) : null}
      {item.state === 'old' && item.outboxId ? (
        <View style={styles.outboxRow}>
          <Label icon="clock-alert" text={t('app.chat.oldMessage')} />
          <Button compact mode="text" onPress={() => actions.onSendNow(item.outboxId!)}>
            {t('app.chat.sendNow')}
          </Button>
          <Button compact mode="text" onPress={() => actions.onCancel(item.outboxId!)} textColor={colors.error}>
            {t('app.chat.discard')}
          </Button>
        </View>
      ) : null}
    </View>
  )
}

function Label({ icon, text }: { icon: string; text: string }) {
  const { colors } = useHermesTheme()

  return (
    <View style={styles.label}>
      <Icon color={colors.onSurfaceVariant} size={14} source={icon} />
      <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
        {text}
      </Text>
    </View>
  )
}

function Reasoning({ streaming, text }: { streaming: boolean; text: string }) {
  const { colors } = useHermesTheme()
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.reasoning}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={styles.reasoningHeader}>
        <Icon color={colors.onSurfaceVariant} size={16} source={open ? 'chevron-down' : 'chevron-right'} />
        <Text style={{ color: colors.onSurfaceVariant }} variant="labelMedium">
          {streaming ? t('assistant.thread.thinking') : t('assistant.thread.thought')}
        </Text>
      </Pressable>
      {open ? (
        <Text selectable style={[styles.reasoningText, { borderColor: colors.outline, color: colors.onSurfaceVariant }]} variant="bodySmall">
          {text}
        </Text>
      ) : null}
    </View>
  )
}

/** The file name, made safe for a testID. */
const mediaSlug = (path: string) => mediaName(path).toLowerCase().replace(/[^a-z0-9]+/g, '-')

const CHIP_ICON: Record<MediaKind, string> = {
  audio: 'music-note',
  file: 'file-document',
  image: 'image',
  video: 'movie'
}

/** A delivered file that isn't an image: a small muted chip with the kind's icon and the file name. */
function MediaChip({ alert = false, path }: { alert?: boolean; path: string }) {
  const { colors } = useHermesTheme()

  return (
    <View style={[styles.mediaChip, { borderColor: colors.outline }]} testID={`media-${mediaSlug(path)}-chip`}>
      <Icon color={alert ? colors.error : colors.onSurfaceVariant} size={16} source={alert ? 'alert-circle' : CHIP_ICON[mediaKind(path)]} />
      <Text numberOfLines={1} style={[styles.flex, { color: colors.onSurfaceVariant }]} variant="bodySmall">
        {mediaName(path)}
      </Text>
    </View>
  )
}

/**
 * A delivered image. The bytes are read from the Gateway; the frame shows a
 * spinner while that runs, and a fallback chip when the file is missing,
 * unreadable, or the Gateway can't be reached. Tapping the image switches
 * between a fixed frame and full width.
 */
function MediaImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const slug = mediaSlug(path)

  useEffect(() => {
    const rest = $gateway.get()?.rest

    if (!rest) {
      setFailed(true)

      return
    }

    let onScreen = true

    loadMediaDataUrl(rest, path)
      .then(dataUrl => {
        if (onScreen) {
          setSrc(dataUrl)
        }
      })
      .catch(() => {
        if (onScreen) {
          setFailed(true)
        }
      })

    return () => {
      onScreen = false
    }
  }, [path])

  if (failed) {
    return <MediaChip alert path={path} />
  }

  if (!src) {
    return (
      <View style={styles.mediaPlaceholder} testID={`media-${slug}-loading`}>
        <ActivityIndicator size={18} />
      </View>
    )
  }

  return (
    <Pressable
      accessibilityLabel={mediaName(path)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => setExpanded(!expanded)}
      style={expanded ? styles.mediaExpanded : styles.mediaFrame}
      testID={`media-${slug}`}
    >
      <Image resizeMode="contain" source={{ uri: src }} style={styles.mediaImage} testID={`media-${slug}-image`} />
    </Pressable>
  )
}

/** One MEDIA directive: an image inline, everything else a chip. */
function Media({ path }: { path: string }) {
  return mediaKind(path) === 'image' ? <MediaImage path={path} /> : <MediaChip path={path} />
}

function AssistantBubble({ item }: { item: AssistantItem }) {
  const { colors } = useHermesTheme()
  const segments = useMemo(() => (item.text ? parseMediaSegments(item.text) : []), [item.text])

  return (
    <View style={styles.assistant}>
      {item.reasoning ? <Reasoning streaming={Boolean(item.streaming) && !item.text} text={item.reasoning} /> : null}
      {segments.length ? (
        segments.map((segment, index) =>
          segment.kind === 'text' ? <Markdown key={index} text={segment.text} /> : <Media key={index} path={segment.path} />
        )
      ) : item.streaming && !item.reasoning ? (
        <ActivityIndicator size={14} style={styles.typing} />
      ) : null}
      {item.error ? (
        <View style={[styles.error, { backgroundColor: colors.errorContainer }]}>
          <Icon color={colors.error} size={16} source="alert-circle" />
          <Text style={[styles.flex, { color: colors.onErrorContainer }]} variant="bodySmall">
            <Text style={{ color: colors.error, fontWeight: '600' }}>{t('notifications.native.turnErrorTitle')}. </Text>
            {item.error}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const pretty = (value: unknown) => {
  if (value === undefined || value === null) {
    return ''
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function Mono({ label, text }: { label: string; text: string }) {
  const { colors } = useHermesTheme()

  return (
    <View style={styles.monoBlock}>
      <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
        {label}
      </Text>
      <ScrollView horizontal style={[styles.monoScroll, { backgroundColor: colors.surfaceVariant }]}>
        <Text selectable style={[styles.mono, { color: colors.onSurface }]}>
          {text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text}
        </Text>
      </ScrollView>
    </View>
  )
}

/** A tool call: name and summary, tapped open to show the arguments, result and diff. */
function ToolRow({ item }: { item: ToolItem }) {
  const { colors } = useHermesTheme()
  const [open, setOpen] = useState(false)
  const summary = item.summary ?? item.context ?? (item.running ? t('app.chat.running') : '')

  return (
    <View style={[styles.tool, { borderColor: colors.outline }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toolHeader}
        testID={`tool-${item.toolId}`}
      >
        {item.running ? (
          <ActivityIndicator size={14} />
        ) : (
          <Icon color={colors.primary} size={16} source="check-circle" />
        )}
        <Text style={styles.toolName} variant="labelLarge">
          {item.name}
        </Text>
        <Text numberOfLines={1} style={[styles.flex, { color: colors.onSurfaceVariant }]} variant="bodySmall">
          {summary}
        </Text>
        <Icon color={colors.onSurfaceVariant} size={16} source={open ? 'chevron-up' : 'chevron-down'} />
      </Pressable>
      {open ? (
        <View style={styles.toolBody}>
          {item.args !== undefined ? <Mono label={t('app.chat.arguments')} text={pretty(item.args)} /> : null}
          {item.result ? <Mono label={t('app.chat.result')} text={item.result} /> : null}
          {item.diff ? <Mono label={t('app.chat.changes')} text={item.diff} /> : null}
        </View>
      ) : null}
    </View>
  )
}

function Note({ item }: { item: NoteItem }) {
  const { colors } = useHermesTheme()

  return (
    <View style={styles.note}>
      <Icon color={item.tone === 'error' ? colors.error : colors.onSurfaceVariant} size={14} source={item.tone === 'error' ? 'alert-circle' : 'information'} />
      <Text style={[styles.flex, { color: item.tone === 'error' ? colors.error : colors.onSurfaceVariant }]} variant="bodySmall">
        {item.text}
      </Text>
    </View>
  )
}

/** One transcript item. Items are memoized, so only the one that changed redraws. */
export const TranscriptItem = memo(function TranscriptItem({ actions, item }: { actions: OutboxActions; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <UserBubble actions={actions} item={item} />
    case 'assistant':
      return <AssistantBubble item={item} />
    case 'tool':
      return <ToolRow item={item} />
    case 'note':
      return <Note item={item} />
  }
})

const styles = StyleSheet.create({
  assistant: { paddingHorizontal: space.screen, paddingVertical: space.step },
  error: { alignItems: 'flex-start', borderRadius: 8, flexDirection: 'row', gap: space.step * 2, marginTop: space.step, padding: space.listGap },
  faded: { opacity: 0.7 },
  flex: { flex: 1 },
  label: { alignItems: 'center', flexDirection: 'row', gap: space.step },
  mediaChip: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.step,
    marginVertical: space.step,
    maxWidth: 260,
    paddingVertical: space.step,
    paddingHorizontal: space.listGap
  },
  mediaExpanded: { borderRadius: 8, height: 420, marginVertical: space.step, overflow: 'hidden', width: '100%' },
  mediaFrame: { alignSelf: 'flex-start', borderRadius: 8, height: 260, marginVertical: space.step, maxWidth: '100%', overflow: 'hidden', width: 300 },
  mediaImage: { flex: 1 },
  mediaPlaceholder: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, height: 120, justifyContent: 'center', marginVertical: space.step, width: 220 },
  mono: { fontFamily: 'monospace', fontSize: 12, lineHeight: 16, padding: space.listGap },
  monoBlock: { gap: 2 },
  monoScroll: { borderRadius: 6, maxHeight: 240 },
  note: { alignItems: 'center', flexDirection: 'row', gap: space.step * 2, paddingHorizontal: space.screen, paddingVertical: space.step },
  outboxRow: { alignItems: 'center', flexDirection: 'row', gap: space.step },
  reasoning: { marginBottom: space.step },
  reasoningHeader: { alignItems: 'center', flexDirection: 'row', gap: space.step, paddingVertical: 2 },
  reasoningText: { borderLeftWidth: 2, marginLeft: space.step * 2, paddingLeft: space.listGap },
  tool: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: space.screen, marginVertical: 2 },
  toolBody: { gap: space.listGap, paddingBottom: space.listGap, paddingHorizontal: space.listGap },
  toolHeader: { alignItems: 'center', flexDirection: 'row', gap: space.listGap, minHeight: 36, paddingHorizontal: space.listGap },
  toolName: { fontFamily: 'monospace' },
  typing: { alignSelf: 'flex-start', marginVertical: space.step },
  userBubble: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '85%', paddingHorizontal: space.screen, paddingVertical: space.listGap },
  userRow: { alignItems: 'flex-end', gap: 2, paddingHorizontal: space.screen, paddingVertical: space.step }
})
