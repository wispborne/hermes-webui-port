import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Icon, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { UnreachableMessage } from '@/components/unreachable-message'
import { VersionBanner } from '@/components/version-banner'
import { checkGateway, type GatewayCheck } from '@/gateway/status'
import { t } from '@/i18n/t'
import { openGatewayDatabase } from '@/storage/database'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** The start screen: enter a gateway URL, check it, and see its Hermes version. */
export function GatewayCheckScreen() {
  const { colors } = useHermesTheme()
  const [url, setUrl] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<GatewayCheck | null>(null)

  const check = useCallback(async () => {
    setChecking(true)

    try {
      const found = await checkGateway(url)
      setResult(found)

      if (found.kind === 'gateway') {
        // Later changes save the gateway's data here.
        openGatewayDatabase(found.url).catch((error: unknown) => console.warn('Could not open saved data', error))
      }
    } finally {
      setChecking(false)
    }
  }, [url])

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      {result?.kind === 'gateway' ? <VersionBanner gatewayVersion={result.version} /> : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="titleLarge">{t('app.gatewayCheck.title')}</Text>
          <Text style={{ color: colors.onSurfaceVariant }} variant="bodyMedium">
            {t('app.gatewayCheck.intro')}
          </Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="url"
            autoCorrect={false}
            dense
            inputMode="url"
            label={t('settings.connections.urlTitle')}
            mode="outlined"
            onChangeText={setUrl}
            onSubmitEditing={check}
            placeholder={t('app.gatewayCheck.urlPlaceholder')}
            returnKeyType="go"
            testID="gateway-url"
            value={url}
          />
          <Button compact disabled={checking || !url.trim()} mode="contained" onPress={check} style={styles.button}>
            {checking ? t('app.gatewayCheck.checking') : t('app.gatewayCheck.check')}
          </Button>
          <View style={styles.result}>
            {checking ? <ActivityIndicator size="small" /> : <CheckResult onRetry={check} result={result} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function CheckResult({ onRetry, result }: { onRetry: () => void; result: GatewayCheck | null }) {
  const { colors } = useHermesTheme()

  switch (result?.kind) {
    case undefined:
      return null

    case 'gateway':
      return (
        <View style={styles.row}>
          <Icon color={colors.primary} size={18} source="check-circle-outline" />
          <Text variant="bodyMedium">{t('app.gatewayCheck.version', { version: result.version })}</Text>
        </View>
      )

    case 'unreachable':
      return <UnreachableMessage onRetry={onRetry} />

    case 'not-a-gateway':
      return (
        <Text style={{ color: colors.error }} variant="bodyMedium">
          {t('app.gatewayCheck.notAGateway')}
        </Text>
      )

    case 'invalid-url':
      return (
        <Text style={{ color: colors.error }} variant="bodyMedium">
          {t('app.gatewayCheck.invalidUrl')}
        </Text>
      )
  }
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start' },
  content: { gap: space.listGap, padding: space.screen },
  fill: { flex: 1 },
  result: { minHeight: 40, justifyContent: 'center' },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.listGap }
})
