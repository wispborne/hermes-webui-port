// The pages behind Settings' sections, one per web settings dialog section the
// phone has. Each is its own route under src/app/settings/. Memory & Context is
// in settings-memory-page.tsx.

import { useStore } from '@nanostores/react'
import Constants from 'expo-constants'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, List, Switch } from 'react-native-paper'

import { askBackgroundPermissions } from '@/background/permission-dialogs'
import { $batteryRestricted, $keepConnected, setKeepConnected } from '@/background/wiring'
import { AppearanceSettings } from '@/components/appearance-settings'
import { SettingsPage } from '@/components/settings-page'
import { checkSignIn } from '@/gateway/auth'
import { BUILT_FOR_HERMES_VERSION } from '@/gateway/built-for-version'
import { checkGateway } from '@/gateway/status'
import { t } from '@/i18n/t'
import { $auth, $gateway, signOut } from '@/store/gateway'
import { space } from '@/theme/compact'

export function AppearancePage() {
  return (
    <SettingsPage title={t('settings.sections.appearance')}>
      <AppearanceSettings />
    </SettingsPage>
  )
}

function toggleKeepConnected(on: boolean) {
  setKeepConnected(on)

  if (on) {
    void askBackgroundPermissions()
  }
}

/** Notifications: Keep connected, which is what lets the phone alert in the background. */
export function NotificationsPage() {
  const keepConnected = useStore($keepConnected)
  const batteryRestricted = useStore($batteryRestricted)

  return (
    <SettingsPage title={t('settings.nav.notifications')}>
      <List.Item
        description={t('app.background.keepConnectedDescription')}
        descriptionNumberOfLines={4}
        onPress={() => toggleKeepConnected(!keepConnected)}
        right={() => <Switch onValueChange={toggleKeepConnected} testID="keep-connected" value={keepConnected} />}
        title={t('app.background.keepConnected')}
      />
      {batteryRestricted ? (
        <List.Item
          description={t('app.background.batteryDeclined')}
          descriptionNumberOfLines={3}
          left={props => <List.Icon {...props} icon="battery-alert-variant" />}
          title={t('app.background.batteryTitle')}
        />
      ) : null}
    </SettingsPage>
  )
}

/** Gateways: which gateway, who is signed in, and Sign out. */
export function GatewaysPage() {
  const auth = useStore($auth)
  const gateway = useStore($gateway)
  const url = auth.phase === 'signed-in' ? auth.url : null
  const [user, setUser] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!gateway) {
      return
    }

    let live = true

    void checkSignIn(gateway.rest).then(check => {
      if (live && check.kind === 'signed-in') {
        setUser(check.user.name)
      }
    })

    return () => {
      live = false
    }
  }, [gateway])

  const unknown = t('app.settings.unknown')
  const signedInAs = user ?? (auth.phase === 'signed-in' ? auth.username : null) ?? unknown

  return (
    <SettingsPage title={t('settings.nav.gateway')}>
      <List.Item description={url ?? unknown} title={t('app.settings.gateway')} />
      <List.Item description={signedInAs} testID="signed-in-as" title={t('app.settings.signedInAs')} />
      <View style={styles.actions}>
        <Button
          compact
          disabled={signingOut}
          icon="logout"
          loading={signingOut}
          mode="outlined"
          onPress={async () => {
            setSigningOut(true)

            try {
              await signOut()
            } finally {
              setSigningOut(false)
            }
          }}
          style={styles.button}
        >
          {t('settings.gateway.signOut')}
        </Button>
      </View>
    </SettingsPage>
  )
}

/** About: the app's version, the Hermes version it was built for, and the gateway's. */
export function AboutPage() {
  const gateway = useStore($gateway)
  const [gatewayVersion, setGatewayVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!gateway) {
      return
    }

    let live = true

    void checkGateway(gateway.url).then(found => {
      if (live && found.kind === 'gateway') {
        setGatewayVersion(found.version)
      }
    })

    return () => {
      live = false
    }
  }, [gateway])

  const unknown = t('app.settings.unknown')

  return (
    <SettingsPage title={t('settings.nav.about')}>
      <List.Item description={Constants.expoConfig?.version ?? unknown} title={t('app.settings.appVersion')} />
      <List.Item description={BUILT_FOR_HERMES_VERSION} title={t('app.settings.builtFor')} />
      <List.Item
        description={gatewayVersion ?? unknown}
        testID="gateway-version"
        title={t('app.settings.gatewayVersion')}
      />
    </SettingsPage>
  )
}

const styles = StyleSheet.create({
  actions: { padding: space.screen },
  button: { alignSelf: 'flex-start' }
})
