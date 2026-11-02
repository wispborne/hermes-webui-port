import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, Dialog, Portal, Text } from 'react-native-paper'

import { formatCost, formatSeconds, formatTokens, type TurnStats } from '@/chat/turn-stats'
import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** The short line under a turn's last reply: time, tokens out and speed. */
export function turnStatsSummary(stats: TurnStats): string {
  const parts: string[] = []

  if (stats.seconds !== undefined) {
    parts.push(formatSeconds(stats.seconds))
  }

  if (stats.output !== undefined) {
    parts.push(t('app.turnStats.tokens', { count: formatTokens(stats.output) }))
  }

  if (stats.tokensPerSecond !== undefined) {
    parts.push(t('app.turnStats.perSecond', { count: Math.round(stats.tokensPerSecond) }))
  }

  return parts.join(' · ')
}

/** Each number the turn has, as a label and its value. */
export function turnStatsRows(stats: TurnStats): [string, string][] {
  const rows: [string, string | undefined][] = [
    [t('app.turnStats.time'), stats.seconds === undefined ? undefined : formatSeconds(stats.seconds)],
    [t('app.turnStats.speed'), stats.tokensPerSecond === undefined ? undefined : t('app.turnStats.perSecond', { count: Math.round(stats.tokensPerSecond * 10) / 10 })],
    [t('app.turnStats.tokensIn'), stats.input === undefined ? undefined : stats.input.toLocaleString()],
    [t('app.turnStats.cached'), stats.cacheRead === undefined ? undefined : stats.cacheRead.toLocaleString()],
    [t('app.turnStats.tokensOut'), stats.output === undefined ? undefined : stats.output.toLocaleString()],
    [t('app.turnStats.thinking'), stats.reasoning === undefined ? undefined : stats.reasoning.toLocaleString()],
    [t('app.turnStats.calls'), stats.calls === undefined ? undefined : String(stats.calls)],
    [t('app.turnStats.cost'), stats.costUsd === undefined ? undefined : formatCost(stats.costUsd)]
  ]

  return rows.filter((row): row is [string, string] => row[1] !== undefined)
}

/** The stats line. Tapping it shows every number. */
export function TurnStatsLine({ stats }: { stats: TurnStats }) {
  const { colors } = useHermesTheme()
  const [open, setOpen] = useState(false)
  const summary = turnStatsSummary(stats)

  if (!summary) {
    return null
  }

  return (
    <>
      <Pressable accessibilityLabel={t('app.turnStats.show')} accessibilityRole="button" hitSlop={8} onPress={() => setOpen(true)} style={styles.line} testID="turn-stats">
        <Text style={[styles.summary, { color: colors.onSurfaceVariant }]} variant="labelSmall">
          {summary}
        </Text>
      </Pressable>
      <Portal>
        <Dialog onDismiss={() => setOpen(false)} visible={open}>
          <Dialog.Title>{t('app.turnStats.title')}</Dialog.Title>
          <Dialog.Content>
            {turnStatsRows(stats).map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={{ color: colors.onSurfaceVariant }} variant="bodyMedium">
                  {label}
                </Text>
                <Text style={styles.value} variant="bodyMedium">
                  {value}
                </Text>
              </View>
            ))}
            {stats.tokensPerSecond !== undefined ? (
              <Text style={[styles.note, { color: colors.onSurfaceVariant }]} variant="bodySmall">
                {t('app.turnStats.speedNote')}
              </Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>{t('app.turnStats.close')}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  )
}

const styles = StyleSheet.create({
  line: { alignSelf: 'center', marginLeft: 8, marginRight: space.step },
  note: { marginTop: space.listGap },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.step },
  summary: { fontVariant: ['tabular-nums'] },
  value: { fontVariant: ['tabular-nums'] }
})
