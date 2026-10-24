import { StyleSheet, View } from 'react-native'
import { Button, Icon, Text } from 'react-native-paper'

import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** "Can't reach the gateway" across the top of a screen while the connection is offline. */
export function OfflineBanner() {
  const { colors } = useHermesTheme()
  const status = useConnectionStatus()

  if (status !== 'offline') {
    return null
  }

  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.errorContainer }]} testID="offline-banner">
      <Icon color={colors.error} size={18} source="cloud-off-outline" />
      <Text style={[styles.text, { color: colors.onErrorContainer }]} variant="bodyMedium">
        {t('app.gatewayCheck.unreachable')}
      </Text>
      <Button compact mode="text" onPress={() => $gateway.get()?.connection.retryNow()}>
        {t('common.retry')}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.listGap,
    paddingLeft: space.screen,
    paddingRight: space.step,
    paddingVertical: space.step
  },
  text: { flex: 1 }
})
