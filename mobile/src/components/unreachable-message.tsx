import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'

import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** "Can't reach the gateway. Is Tailscale connected?" with a Retry button. */
export function UnreachableMessage({ onRetry }: { onRetry: () => void }) {
  const { colors } = useHermesTheme()

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: colors.error }]} variant="bodyMedium">
        {t('app.gatewayCheck.unreachable')}
      </Text>
      <Button compact mode="outlined" onPress={onRetry}>
        {t('common.retry')}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: space.listGap },
  text: { flex: 1 }
})
