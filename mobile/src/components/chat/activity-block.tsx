import { useRef, useState } from 'react'
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Icon, Text } from 'react-native-paper'
import { useRecyclingState } from '@shopify/flash-list'
import { parseColor } from '@hermes/shared/color'

import { type ActivityItem, type ActivityStep, inProgress, type ThinkingStep } from '@/chat/activity'
import type { ToolItem } from '@/chat/items'
import desktopStrings from '@/i18n/en.generated.json'
import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

type ToolTitle = { done: string; pending: string }

const TOOL_TITLES: Record<string, ToolTitle | undefined> = desktopStrings.assistant.tool.titles

const TOOL_ICONS: Record<string, string> = {
  delegate_task: 'account-arrow-right-outline',
  edit_file: 'file-edit-outline',
  execute_code: 'console',
  image_generate: 'image-outline',
  list_files: 'folder-outline',
  memory: 'brain',
  patch: 'file-edit-outline',
  read_file: 'file-document-outline',
  search_files: 'file-search-outline',
  session_search_recall: 'magnify',
  terminal: 'console',
  todo: 'checkbox-marked-outline',
  vision_analyze: 'image-search-outline',
  web_extract: 'web',
  web_search: 'web',
  write_file: 'file-edit-outline'
}

/**
 * Thinking being written shows in a window this many lines tall, which
 * scrolls itself to the newest line, as in the Claude and ChatGPT apps. The
 * screen doesn't move while the thought grows.
 */
const LIVE_THINKING_LINES = 6
const THINKING_LINE_HEIGHT = 16
const LIVE_THINKING_HEIGHT = LIVE_THINKING_LINES * THINKING_LINE_HEIGHT

/** The window holds only this much of a long thought, from its end, so each new word stays quick to draw. */
const LIVE_THINKING_CHARS = 4000

/** The end of a long thought, cut at a line break so it starts with a whole line. */
function thoughtEnd(text: string) {
  if (text.length <= LIVE_THINKING_CHARS) {
    return text
  }

  const end = text.slice(-LIVE_THINKING_CHARS)
  const lineStart = end.indexOf('\n')

  return lineStart >= 0 ? end.slice(lineStart + 1) : end
}

/** The colour with nothing of it showing, for a fade into it. */
function clear(color: string) {
  const rgb = parseColor(color)

  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)` : 'transparent'
}

const toolIcon = (name: string) => TOOL_ICONS[name] ?? (name.startsWith('browser_') ? 'web' : 'wrench-outline')

/** The desktop's title for the tool, such as "Read file", or the tool's name in words. */
function toolTitle(item: ToolItem) {
  const title = TOOL_TITLES[item.name]

  if (title) {
    return item.running ? title.pending : title.done
  }

  const words = item.name.replace(/_/g, ' ').trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The first line of the thought, without Markdown marks at its start. */
const firstLine = (text: string) =>
  text
    .trim()
    .split('\n')[0]
    .replace(/^[#>*\-\s]+/, '')
    .replace(/\*\*/g, '')

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

/** One step's line: an icon, a bold title, and a one-line preview. Tapping it shows the rest. */
function StepLine({
  icon,
  onPress,
  open,
  preview,
  previewFromMiddle,
  running,
  testID,
  title
}: {
  icon: string
  onPress: () => void
  open: boolean
  preview: string
  previewFromMiddle?: boolean
  running: boolean
  testID: string
  title: string
}) {
  const { colors } = useHermesTheme()

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={styles.line} testID={testID}>
      <View style={styles.icon}>{running ? <ActivityIndicator size={12} /> : <Icon color={colors.onSurfaceVariant} size={14} source={icon} />}</View>
      <Text style={[styles.title, { color: colors.onSurface }]} variant="labelMedium">
        {title}
      </Text>
      {open ? null : (
        <Text
          ellipsizeMode={previewFromMiddle ? 'middle' : 'tail'}
          numberOfLines={1}
          style={[styles.flex, { color: colors.onSurfaceVariant }]}
          variant="bodySmall"
        >
          {preview}
        </Text>
      )}
    </Pressable>
  )
}

/**
 * The thought being written, in a short window that keeps its newest line in
 * view. Older lines fade out at the top. Scrolling up in the window stops it
 * following, and scrolling back to the bottom starts it again.
 */
function LiveThinking({ text }: { text: string }) {
  const { colors } = useHermesTheme()
  const scroll = useRef<ScrollView>(null)
  const following = useRef(true)
  const [scrolled, setScrolled] = useState(false)

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent
    following.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - THINKING_LINE_HEIGHT
    setScrolled(contentOffset.y > 0)
  }

  return (
    <View style={[styles.thinkingFrame, { borderColor: colors.outline }]} testID="live-thinking">
      <ScrollView
        nestedScrollEnabled
        onContentSizeChange={() => following.current && scroll.current?.scrollToEnd({ animated: false })}
        onScroll={onScroll}
        ref={scroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        style={styles.liveThinking}
      >
        <Text selectable style={[styles.thinkingLines, { color: colors.onSurfaceVariant }]} variant="bodySmall">
          {thoughtEnd(text)}
        </Text>
      </ScrollView>
      {scrolled ? (
        <View
          pointerEvents="none"
          style={[styles.fade, { experimental_backgroundImage: `linear-gradient(to bottom, ${colors.background}, ${clear(colors.background)})` }]}
        />
      ) : null}
    </View>
  )
}

function Thinking({ onToggle, open, step }: { onToggle: () => void; open: boolean; step: ThinkingStep }) {
  const { colors } = useHermesTheme()
  const text = step.text.trim()

  return (
    <View>
      <StepLine
        icon="thought-bubble-outline"
        onPress={onToggle}
        open={open}
        preview={firstLine(text)}
        running={step.streaming}
        testID={step.key}
        title={step.streaming ? t('assistant.thread.thinking') : t('assistant.thread.thought')}
      />
      {open && step.streaming ? <LiveThinking text={text} /> : null}
      {open && !step.streaming ? (
        <View style={[styles.thinkingFrame, { borderColor: colors.outline }]}>
          <Text selectable style={[styles.thinkingLines, { color: colors.onSurfaceVariant }]} variant="bodySmall">
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// The arguments that say what a call acted on. The gateway's own preview can be a mode, such as "content" for a search.
const PREVIEW_ARGS = ['pattern', 'query', 'command', 'path', 'url']

function toolPreview(item: ToolItem) {
  const args = item.args && typeof item.args === 'object' ? (item.args as Record<string, unknown>) : {}
  const found = PREVIEW_ARGS.map(name => args[name]).find(value => typeof value === 'string' && value.trim())

  return (found as string | undefined) ?? item.context ?? item.summary ?? ''
}

function Tool({ item, onToggle, open }: { item: ToolItem; onToggle: () => void; open: boolean }) {
  const preview = toolPreview(item)

  return (
    <View>
      <StepLine
        icon={toolIcon(item.name)}
        onPress={onToggle}
        open={open}
        preview={preview}
        previewFromMiddle={/^[~.]?[/\\]|^[A-Za-z]:\\/.test(preview)}
        running={item.running}
        testID={`tool-${item.toolId}`}
        title={toolTitle(item)}
      />
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

/**
 * Hermes's thinking and tool calls between two messages, one short line each.
 * While the turn runs, the step happening now is open: thinking shows its
 * text and a tool call its arguments. It closes when it finishes. A step the
 * person opened or closed stays that way.
 */
export function ActivityBlock({ item }: { item: ActivityItem }) {
  // The person's choices, by step key. Reset when the list reuses this view for another block.
  const [chosen, setChosen] = useRecyclingState<Record<string, boolean>>({}, [item.key])

  const render = (step: ActivityStep) => {
    const open = chosen[step.key] ?? (item.live && inProgress(step))
    const onToggle = () => setChosen(current => ({ ...current, [step.key]: !open }))

    return step.kind === 'thinking' ? (
      <Thinking key={step.key} onToggle={onToggle} open={open} step={step} />
    ) : (
      <Tool item={step} key={step.key} onToggle={onToggle} open={open} />
    )
  }

  return <View style={styles.block}>{item.steps.map(render)}</View>
}

const styles = StyleSheet.create({
  block: { paddingVertical: space.step },
  flex: { flex: 1 },
  icon: { alignItems: 'center', width: 16 },
  line: { alignItems: 'center', flexDirection: 'row', gap: space.listGap, minHeight: 28, paddingHorizontal: space.screen },
  mono: { fontFamily: 'monospace', fontSize: 12, lineHeight: 16, padding: space.listGap },
  monoBlock: { gap: 2 },
  monoScroll: { borderRadius: 6, maxHeight: 240 },
  fade: { height: THINKING_LINE_HEIGHT * 2, left: 0, position: 'absolute', right: 0, top: 0 },
  liveThinking: { maxHeight: LIVE_THINKING_HEIGHT },
  thinkingFrame: { borderLeftWidth: 2, marginBottom: space.step, marginLeft: space.screen + space.listGap, marginRight: space.screen, paddingLeft: space.listGap },
  thinkingLines: { lineHeight: THINKING_LINE_HEIGHT },
  title: { fontWeight: '600' },
  toolBody: { gap: space.listGap, paddingBottom: space.listGap, paddingLeft: space.screen + 16 + space.listGap, paddingRight: space.screen }
})
