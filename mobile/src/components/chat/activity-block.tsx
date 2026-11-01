import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Icon, Text } from 'react-native-paper'
import { useRecyclingState } from '@shopify/flash-list'

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

/** Live thinking shows only its last part, so a long thought doesn't push the screen around. */
const LIVE_THINKING_CHARS = 800

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

function Thinking({ auto, onToggle, open, step }: { auto: boolean; onToggle: () => void; open: boolean; step: ThinkingStep }) {
  const { colors } = useHermesTheme()
  const text = step.text.trim()
  const shown = auto && text.length > LIVE_THINKING_CHARS ? `…${text.slice(-LIVE_THINKING_CHARS)}` : text

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
      {open ? (
        <Text selectable style={[styles.thinkingText, { borderColor: colors.outline, color: colors.onSurfaceVariant }]} variant="bodySmall">
          {shown}
        </Text>
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
    const auto = chosen[step.key] === undefined
    const open = chosen[step.key] ?? (item.live && inProgress(step))
    const onToggle = () => setChosen(current => ({ ...current, [step.key]: !open }))

    return step.kind === 'thinking' ? (
      <Thinking auto={auto} key={step.key} onToggle={onToggle} open={open} step={step} />
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
  thinkingText: { borderLeftWidth: 2, marginBottom: space.step, marginLeft: space.screen + space.listGap, marginRight: space.screen, paddingLeft: space.listGap },
  title: { fontWeight: '600' },
  toolBody: { gap: space.listGap, paddingBottom: space.listGap, paddingLeft: space.screen + 16 + space.listGap, paddingRight: space.screen }
})
