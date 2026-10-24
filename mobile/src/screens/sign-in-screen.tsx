import { useStore } from '@nanostores/react'
import { useCallback, useState } from 'react'
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Icon, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { UnreachableMessage } from '@/components/unreachable-message'
import { VersionBanner } from '@/components/version-banner'
import type { SignInResult } from '@/gateway/auth'
import { checkGateway, type GatewayCheck, normalizeGatewayUrl } from '@/gateway/status'
import { t } from '@/i18n/t'
import { $auth, signIn } from '@/store/gateway'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

function signInMessage(result: SignInResult): string | null {
  switch (result.kind) {
    case 'signed-in':
      return null
    case 'wrong-password':
      return t('app.signIn.wrongPassword')
    case 'too-many-attempts':
      return t('app.signIn.tooManyAttempts')
    case 'no-password-sign-in':
      return t('app.signIn.noPasswordSignIn')
    case 'password-store-down':
      return t('app.signIn.passwordStoreDown')
    case 'unreachable':
      return t('app.gatewayCheck.unreachable')
    case 'failed':
      return t('app.signIn.failedStatus', { status: result.status })
  }
}

/**
 * Sign in: the gateway URL (checked the way the foundation's start screen
 * checked it), the username and the password. The password lives only in
 * this screen's state and the sign-in request.
 */
export function SignInScreen() {
  const { colors } = useHermesTheme()
  const auth = useStore($auth)
  const saved = auth.phase === 'signed-out' ? auth : null
  const [url, setUrl] = useState(saved?.url ?? '')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<GatewayCheck | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runCheck = useCallback(async (): Promise<GatewayCheck> => {
    setChecking(true)

    try {
      const found = await checkGateway(url)
      setCheck(found)

      return found
    } finally {
      setChecking(false)
    }
  }, [url])

  // The last check, if it was for the URL in the field now.
  const currentCheck = check && check.kind !== 'invalid-url' && check.url === normalizeGatewayUrl(url) ? check : null

  const onUrlBlur = useCallback(() => {
    if (url.trim() && !currentCheck) {
      void runCheck()
    }
  }, [currentCheck, runCheck, url])

  const submit = useCallback(async () => {
    setError(null)
    setSigningIn(true)

    try {
      const found = currentCheck?.kind === 'gateway' ? currentCheck : await runCheck()

      if (found.kind !== 'gateway') {
        return
      }

      const result = await signIn(found.url, username.trim(), password)
      const message = signInMessage(result)

      if (message) {
        setError(message)
      } else {
        setPassword('')
      }
    } catch (failure) {
      setError(`${t('settings.gateway.signInFailed')}: ${String(failure)}`)
    } finally {
      setSigningIn(false)
    }
  }, [currentCheck, password, runCheck, username])

  const busy = checking || signingIn
  const canSubmit = !busy && url.trim() !== '' && username.trim() !== '' && password !== ''

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.fill}>
      {check?.kind === 'gateway' ? <VersionBanner gatewayVersion={check.version} /> : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="titleLarge">{t('settings.gateway.signIn')}</Text>
          <Text style={{ color: colors.onSurfaceVariant }} variant="bodyMedium">
            {t('app.signIn.intro')}
          </Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="url"
            autoCorrect={false}
            dense
            inputMode="url"
            label={t('settings.connections.urlTitle')}
            mode="outlined"
            onBlur={onUrlBlur}
            onChangeText={setUrl}
            placeholder={t('app.gatewayCheck.urlPlaceholder')}
            returnKeyType="next"
            testID="gateway-url"
            value={url}
          />
          <View style={styles.check}>
            {checking ? <ActivityIndicator size="small" /> : <CheckResult onRetry={runCheck} result={check} />}
          </View>
          <TextInput
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            dense
            label={t('settings.vault.identifierTypes.username')}
            mode="outlined"
            onChangeText={setUsername}
            returnKeyType="next"
            testID="username"
            textContentType="username"
            value={username}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect={false}
            dense
            label={t('settings.vault.passwordField')}
            mode="outlined"
            onChangeText={setPassword}
            onSubmitEditing={canSubmit ? submit : undefined}
            returnKeyType="go"
            secureTextEntry
            testID="password"
            textContentType="password"
            value={password}
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.error }} testID="sign-in-error" variant="bodyMedium">
              {error}
            </Text>
          ) : null}
          <Button compact disabled={!canSubmit} loading={signingIn} mode="contained" onPress={submit} style={styles.button} testID="sign-in">
            {signingIn ? t('app.signIn.signingIn') : t('settings.gateway.signIn')}
          </Button>
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
  check: { justifyContent: 'center', minHeight: 24 },
  content: { gap: space.listGap, padding: space.screen },
  fill: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: space.listGap }
})
