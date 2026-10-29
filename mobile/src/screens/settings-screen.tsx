import { useStore } from '@nanostores/react'
import { type Href, router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { Appbar, List } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { t } from '@/i18n/t'
import { $pendingMemoryCount, reloadMemoryReview } from '@/store/memory-review'

interface Section {
  id: string
  label: () => string
  icon: string
  href: Href
}

/**
 * The web settings dialog's sections the phone has, in the dialog's order:
 * Model, Chat, Appearance, Workspace, Safety, Browser, Passwords & Logins,
 * Memory & Context, Voice, Advanced, Notifications, Billing, Providers,
 * Gateways, Keyboard Shortcuts, Tools & Keys, Sessions, Plugins, About.
 */
const SECTIONS: Section[] = [
  {
    id: 'appearance',
    label: () => t('settings.sections.appearance'),
    icon: 'palette-outline',
    href: '/settings/appearance'
  },
  { id: 'memory', label: () => t('settings.sections.memory'), icon: 'brain', href: '/settings/memory' },
  {
    id: 'notifications',
    label: () => t('settings.nav.notifications'),
    icon: 'bell-outline',
    href: '/settings/notifications'
  },
  { id: 'gateways', label: () => t('settings.nav.gateway'), icon: 'server-network', href: '/settings/gateways' },
  { id: 'about', label: () => t('settings.nav.about'), icon: 'information-outline', href: '/settings/about' }
]

/** Settings: the list of sections, laid out like the web UI's settings dialog. Each opens its own page. */
export function SettingsScreen() {
  const pendingMemories = useStore($pendingMemoryCount)

  useFocusEffect(
    useCallback(() => {
      void reloadMemoryReview()
    }, [])
  )

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/sessions'))} />
        <Appbar.Content title={t('settings.nav.keysSettings')} />
      </Appbar.Header>
      <OfflineBanner />
      <ScrollView>
        {SECTIONS.map(section => (
          <List.Item
            description={
              section.id === 'memory' && pendingMemories > 0
                ? t('app.memoryReview.waiting', { count: pendingMemories })
                : undefined
            }
            key={section.id}
            left={props => <List.Icon {...props} icon={section.icon} />}
            onPress={() => router.push(section.href)}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            testID={`settings-${section.id}`}
            title={section.label()}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 }
})
