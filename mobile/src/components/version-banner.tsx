import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { BUILT_FOR_HERMES_VERSION } from '@/gateway/built-for-version'
import { versionDiffers } from '@/gateway/status'
import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/**
 * Names both versions when the gateway runs a different Hermes version from
 * the one this build was made for. Shows nothing when they match. The app
 * keeps working either way.
 */
export function VersionBanner({ gatewayVersion }: { gatewayVersion: string }) {
  const { colors } = useHermesTheme()

  if (!versionDiffers(gatewayVersion)) {
    return null
  }

  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.secondaryContainer }]}>
      <Icon color={colors.onSecondaryContainer} size={18} source="information" />
      <Text style={[styles.text, { color: colors.onSecondaryContainer }]} variant="bodyMedium">
        {t('app.versionBanner', { builtFor: BUILT_FOR_HERMES_VERSION, gateway: gatewayVersion })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.listGap,
    paddingHorizontal: space.screen,
    paddingVertical: space.listGap
  },
  text: { flex: 1 }
})
