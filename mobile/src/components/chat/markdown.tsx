import { mix } from '@hermes/shared/color'
import { memo, useMemo } from 'react'
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown'

import { typeScale } from '@/theme/compact'
import type { HermesTheme } from '@/theme/theme'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** Markdown styles from the app's colours, for light and dark mode. */
function markdownStyle(theme: HermesTheme): MarkdownStyle {
  const { colors, dark } = theme
  const body = { fontSize: typeScale.bodyMedium.fontSize, lineHeight: typeScale.bodyMedium.lineHeight, color: colors.onSurface }
  const codeBackground = dark ? mix(colors.background, colors.onSurface, 0.08) : '#1f2430'

  return {
    paragraph: { ...body, marginTop: 0, marginBottom: 8 },
    h1: { fontSize: 20, lineHeight: 26, color: colors.onSurface, marginTop: 8, marginBottom: 6 },
    h2: { fontSize: 18, lineHeight: 24, color: colors.onSurface, marginTop: 8, marginBottom: 6 },
    h3: { fontSize: 16, lineHeight: 22, color: colors.onSurface, marginTop: 6, marginBottom: 4 },
    h4: { fontSize: 15, lineHeight: 20, color: colors.onSurface, marginTop: 6, marginBottom: 4 },
    list: { ...body, bulletColor: colors.onSurfaceVariant, markerColor: colors.onSurfaceVariant, marginBottom: 8 },
    blockquote: {
      ...body,
      color: colors.onSurfaceVariant,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceVariant,
      marginBottom: 8
    },
    code: { color: colors.primary, backgroundColor: colors.surfaceVariant, borderColor: colors.surfaceVariant },
    codeBlock: { fontSize: 13, lineHeight: 18, backgroundColor: codeBackground, borderColor: codeBackground, color: '#e6e6e6', borderRadius: 8, padding: 10, marginBottom: 8 },
    link: { color: colors.primary, underline: true },
    table: {
      fontSize: 13,
      color: colors.onSurface,
      borderColor: colors.outline,
      headerBackgroundColor: colors.surfaceVariant,
      headerTextColor: colors.onSurfaceVariant,
      rowEvenBackgroundColor: colors.background,
      rowOddBackgroundColor: mix(colors.background, colors.surfaceVariant, 0.5),
      marginBottom: 8
    }
  } as MarkdownStyle
}

/**
 * A reply's Markdown, drawn natively by react-native-enriched-markdown (the
 * pick of the session-chat Markdown trial). Code blocks are highlighted,
 * scroll sideways and have a copy button.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const theme = useHermesTheme()
  const style = useMemo(() => markdownStyle(theme), [theme])

  return <EnrichedMarkdownText flavor="github" markdown={text} markdownStyle={style} selectable />
})
