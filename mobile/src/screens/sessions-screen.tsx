import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Appbar, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** A placeholder until the session-list change fills it in. */
export function SessionsScreen() {
  const { colors } = useHermesTheme()

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.Content title={t('sidebar.sessions')} />
        <Appbar.Action accessibilityLabel={t('settings.nav.keysSettings')} icon="cog-outline" onPress={() => router.push('/settings')} />
      </Appbar.Header>
      <OfflineBanner />
      <View style={styles.content}>
        <Text style={{ color: colors.onSurfaceVariant }} variant="bodyMedium">
          {t('sidebar.noSessions')}
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.screen },
  fill: { flex: 1 }
})
