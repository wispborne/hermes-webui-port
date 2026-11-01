import { useStore } from '@nanostores/react'
import { memo, useEffect, useMemo, useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Icon, Text } from 'react-native-paper'

import type { DisplayItem } from '@/chat/activity'
import type { AssistantItem, NoteItem, UserItem } from '@/chat/items'
import { type MediaKind, mediaKind, mediaName, parseMediaSegments } from '@/chat/media'
import { loadMediaDataUrl, loadProxiedImage } from '@/gateway/media-api'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

import { ActivityBlock } from './activity-block'
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
            <Media key={`${index}:${segment.path}`} path={segment.path} />
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

type ImageState = { phase: 'loading' } | { phase: 'shown'; src: string; proxied: boolean } | { phase: 'failed' }

/**
 * A delivered image. The bytes are read from the Gateway; the frame shows a
 * spinner while that runs, and a fallback chip when the file is missing,
 * unreadable, or the Gateway can't be reached. A failed image is read again
 * when the connection to the Gateway comes back. An `http(s)` image the phone
 * can't load is asked of the Gateway's image proxy before it gives up. Tapping
 * the image switches between a fixed frame and full width. Once the picture
 * loads, the frame takes its shape, so a wide chart has no empty bands.
 */
function MediaImage({ path }: { path: string }) {
  const gateway = useStore($gateway)
  const [state, setState] = useState<ImageState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)
  /** Width over height, once the picture has loaded. */
  const [ratio, setRatio] = useState<number | null>(null)
  const slug = mediaSlug(path)
  const failed = state.phase === 'failed'

  useEffect(() => {
    const rest = gateway?.rest

    if (!rest) {
      setState({ phase: 'failed' })

      return
    }

    let onScreen = true

    setState({ phase: 'loading' })
    loadMediaDataUrl(rest, path)
      .then(src => {
        if (onScreen) {
          setState({ phase: 'shown', src, proxied: false })
        }
      })
      .catch(() => {
        if (onScreen) {
          setState({ phase: 'failed' })
        }
      })

    return () => {
      onScreen = false
    }
  }, [attempt, gateway, path])

  // Read again once the connection comes back: the phone may have been offline when it first asked.
  useEffect(() => {
    if (!failed || !gateway) {
      return
    }

    return gateway.connection.$status.listen(status => {
      if (status === 'open') {
        setAttempt(count => count + 1)
      }
    })
  }, [failed, gateway])

  /** The picture couldn't be drawn: try the Gateway's proxy for a web image, else show the chip. */
  const onImageError = () => {
    const rest = gateway?.rest

    if (state.phase !== 'shown' || state.proxied || !rest || !/^https?:/i.test(path)) {
      setState({ phase: 'failed' })

      return
    }

    loadProxiedImage(rest, path)
      .then(src => setState(current => (current.phase === 'shown' ? { phase: 'shown', src, proxied: true } : current)))
      .catch(() => setState({ phase: 'failed' }))
  }

  if (state.phase === 'failed') {
    return <MediaChip alert path={path} />
  }

  if (state.phase === 'loading') {
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
      style={[expanded ? styles.mediaExpanded : styles.mediaFrame, ratio ? { aspectRatio: ratio } : expanded ? styles.mediaExpandedLoading : styles.mediaFrameLoading]}
      testID={`media-${slug}`}
    >
      <Image
        onError={onImageError}
        onLoad={event => {
          const { height, width } = event.nativeEvent.source

          if (width > 0 && height > 0) {
            setRatio(width / height)
          }
        }}
        resizeMode="contain"
        source={{ uri: state.src }}
        style={styles.mediaImage}
        testID={`media-${slug}-image`}
      />
    </Pressable>
  )
}

/** One MEDIA directive: an image inline, everything else a chip. */
function Media({ path }: { path: string }) {
  return mediaKind(path) === 'image' ? <MediaImage path={path} /> : <MediaChip path={path} />
}

function AssistantBubble({ item }: { item: AssistantItem }) {
  const { colors } = useHermesTheme()
  const streaming = Boolean(item.streaming)
  const segments = useMemo(() => (item.text ? parseMediaSegments(item.text, { markdown: true, streaming }) : []), [item.text, streaming])

  return (
    <View style={styles.assistant}>
      {segments.length ? (
        segments.map((segment, index) =>
          segment.kind === 'text' ? <Markdown key={index} text={segment.text} /> : <Media key={`${index}:${segment.path}`} path={segment.path} />
        )
      ) : item.streaming ? (
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
export const TranscriptItem = memo(function TranscriptItem({ actions, item }: { actions: OutboxActions; item: DisplayItem }) {
  switch (item.kind) {
    case 'user':
      return <UserBubble actions={actions} item={item} />
    case 'assistant':
      return <AssistantBubble item={item} />
    case 'activity':
      return <ActivityBlock item={item} />
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
  // A frame takes the picture's shape once it loads, up to maxHeight. The Loading heights hold the space until then.
  mediaExpanded: { borderRadius: 8, marginVertical: space.step, maxHeight: 640, overflow: 'hidden', width: '100%' },
  mediaExpandedLoading: { height: 420 },
  mediaFrame: { alignSelf: 'flex-start', borderRadius: 8, marginVertical: space.step, maxHeight: 360, maxWidth: '100%', overflow: 'hidden', width: 300 },
  mediaFrameLoading: { height: 260 },
  mediaImage: { flex: 1 },
  mediaPlaceholder: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, height: 120, justifyContent: 'center', marginVertical: space.step, width: 220 },
  note: { alignItems: 'center', flexDirection: 'row', gap: space.step * 2, paddingHorizontal: space.screen, paddingVertical: space.step },
  outboxRow: { alignItems: 'center', flexDirection: 'row', gap: space.step },
  typing: { alignSelf: 'flex-start', marginVertical: space.step },
  userBubble: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, maxWidth: '85%', paddingHorizontal: space.screen, paddingVertical: space.listGap },
  userRow: { alignItems: 'flex-end', gap: 2, paddingHorizontal: space.screen, paddingVertical: space.step }
})
