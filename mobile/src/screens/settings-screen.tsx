import { useStore } from '@nanostores/react'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Appbar, Button, Divider, List, Switch } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { askBackgroundPermissions } from '@/background/permission-dialogs'
import { $batteryRestricted, $keepConnected, setKeepConnected } from '@/background/wiring'
import { OfflineBanner } from '@/components/offline-banner'
import { checkSignIn } from '@/gateway/auth'
import { BUILT_FOR_HERMES_VERSION } from '@/gateway/built-for-version'
import { checkGateway } from '@/gateway/status'
import { t } from '@/i18n/t'
import { $auth, $gateway, signOut } from '@/store/gateway'
import { space } from '@/theme/compact'

function toggleKeepConnected(on: boolean) {
  setKeepConnected(on)

  if (on) {
    void askBackgroundPermissions()
  }
}

/** Settings: the gateway, who is signed in, Keep connected, the three versions, and Sign out. */
export function SettingsScreen() {
  const auth = useStore($auth)
  const gateway = useStore($gateway)
  const url = auth.phase === 'signed-in' ? auth.url : null
  const [user, setUser] = useState<string | null>(null)
  const [gatewayVersion, setGatewayVersion] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const keepConnected = useStore($keepConnected)
  const batteryRestricted = useStore($batteryRestricted)

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
  const signedInAs = user ?? (auth.phase === 'signed-in' ? auth.username : null) ?? unknown

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/sessions'))} />
        <Appbar.Content title={t('settings.nav.keysSettings')} />
      </Appbar.Header>
      <OfflineBanner />
      <ScrollView>
        <List.Item description={url ?? unknown} title={t('app.settings.gateway')} />
        <List.Item description={signedInAs} testID="signed-in-as" title={t('app.settings.signedInAs')} />
        <Divider />
        <List.Item
          description={t('app.background.keepConnectedDescription')}
          descriptionNumberOfLines={3}
          onPress={() => toggleKeepConnected(!keepConnected)}
          right={() => <Switch onValueChange={toggleKeepConnected} testID="keep-connected" value={keepConnected} />}
          title={t('app.background.keepConnected')}
        />
        {batteryRestricted ? (
          <List.Item
            description={t('app.background.batteryDeclined')}
            descriptionNumberOfLines={3}
            left={props => <List.Icon {...props} icon="battery-alert-variant-outline" />}
            title={t('app.background.batteryTitle')}
          />
        ) : null}
        <Divider />
        <List.Item description={Constants.expoConfig?.version ?? unknown} title={t('app.settings.appVersion')} />
        <List.Item description={BUILT_FOR_HERMES_VERSION} title={t('app.settings.builtFor')} />
        <List.Item description={gatewayVersion ?? unknown} testID="gateway-version" title={t('app.settings.gatewayVersion')} />
        <Divider />
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
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  actions: { padding: space.screen },
  button: { alignSelf: 'flex-start' },
  fill: { flex: 1 }
})
