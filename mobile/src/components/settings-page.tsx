import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { Appbar } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'

/** A settings page: the section's name in the top bar with Back to the list, then its rows. */
export function SettingsPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        <Appbar.Content title={title} />
      </Appbar.Header>
      <OfflineBanner />
      <ScrollView>{children}</ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 }
})
