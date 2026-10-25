import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Icon, Text } from 'react-native-paper'

import type { SessionMarker, SessionRow } from '@/gateway/sessions-api'
import { t } from '@/i18n/t'
import { relativeTime } from '@/lib/relative-time'
import { ROW_HEIGHT, space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** The row's heading: the title, or the start of the preview when there is none yet. */
export function sessionHeading(row: SessionRow): string {
  return row.title ?? row.preview?.split('\n')[0]?.slice(0, 80) ?? t('sidebar.row.untitledPlaceholder')
}

interface Props {
  row: SessionRow
  marker: SessionMarker | null
  onPress: (row: SessionRow) => void
}

/** One session in the list: title, preview, when it was last active, and its marker. */
export const SessionListRow = memo(function SessionListRow({ marker, onPress, row }: Props) {
  const { colors } = useHermesTheme()
  const heading = sessionHeading(row)
  const preview = row.title ? row.preview : null

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: colors.surfaceVariant }}
      onPress={() => onPress(row)}
      style={styles.row}
      testID={`session-row-${row.id}`}
    >
      <View style={styles.text}>
        <Text numberOfLines={1} variant="titleMedium">
          {heading}
        </Text>
        {preview ? (
          <Text numberOfLines={1} style={{ color: colors.onSurfaceVariant }} variant="bodySmall">
            {preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>
        <Text style={{ color: colors.onSurfaceVariant }} variant="labelSmall">
          {relativeTime(row.lastActive)}
        </Text>
        <MarkerIcon marker={marker} />
      </View>
    </Pressable>
  )
})

function MarkerIcon({ marker }: { marker: SessionMarker | null }) {
  const { colors } = useHermesTheme()

  if (marker === 'running') {
    return (
      <View accessibilityLabel={t('sidebar.row.sessionRunning')} testID="marker-running">
        <ActivityIndicator color={colors.primary} size={14} />
      </View>
    )
  }

  if (marker === 'needs-input') {
    return (
      <View accessibilityLabel={t('sidebar.row.needsInput')} testID="marker-needs-input">
        <Icon color={colors.error} size={16} source="message-question" />
      </View>
    )
  }

  return <View style={styles.noMarker} />
}

const styles = StyleSheet.create({
  noMarker: { height: 16 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.listGap,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: space.screen,
    paddingVertical: space.step
  },
  side: { alignItems: 'flex-end', gap: 2, minWidth: 40 },
  text: { flex: 1, gap: 2 }
})
