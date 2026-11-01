import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, KeyboardAvoidingView, type TextInput as NativeTextInput, ScrollView, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, HelperText, Icon, Switch, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { VersionBanner } from '@/components/version-banner'
import type { SignInResult } from '@/gateway/auth'
import { checkGateway, type GatewayCheck, normalizeGatewayUrl } from '@/gateway/status'
import { t } from '@/i18n/t'
import { loadAppSettings } from '@/storage/app-settings'
import { $auth, signIn } from '@/store/gateway'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

// The desktop's brand mark (apps/desktop/public/nous-girl*.png), for light and dark mode.
const BRAND_MARK = require('../../assets/brand-mark.png')
const BRAND_MARK_DARK = require('../../assets/brand-mark-dark.png')

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
 * checked it), the username and the password. The password lives in this
 * screen's state and the sign-in request, and in secure storage only when
 * "Remember password" is on.
 *
 * The URL field shows the check inside it: a spinner while it runs, a tick
 * for a gateway, a retry button when the gateway can't be reached. The line
 * under it says the version or what went wrong, and is always there, so the
 * fields below never move.
 */
export function SignInScreen() {
  const { colors, dark } = useHermesTheme()
  const auth = useStore($auth)
  const saved = auth.phase === 'signed-out' ? auth : null
  const [url, setUrl] = useState(saved?.url ?? '')
  const [username, setUsername] = useState(saved?.username ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<GatewayCheck | null>(null)
  const [remember, setRemember] = useState(() => loadAppSettings().rememberPassword !== false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(saved?.savedPasswordRefused ? t('app.signIn.savedPasswordRefused') : null)
  const usernameField = useRef<NativeTextInput>(null)
  const passwordField = useRef<NativeTextInput>(null)

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

  // A saved URL is checked as the screen opens, so the version and the tick are there before the person types.
  useEffect(() => {
    if (saved?.url) {
      void runCheck()
    }
    // Once, for the URL the screen opened with.
  }, [])

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

      const result = await signIn(found.url, username.trim(), password, { remember })
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
  }, [currentCheck, password, remember, runCheck, username])

  const busy = checking || signingIn
  const canSubmit = !busy && url.trim() !== '' && username.trim() !== '' && password !== ''
  const urlProblem = !checking && check !== null && check.kind !== 'gateway'

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.background }]}>
      {check?.kind === 'gateway' ? <VersionBanner gatewayVersion={check.version} /> : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <View style={styles.header}>
              <Image accessibilityIgnoresInvertColors source={dark ? BRAND_MARK_DARK : BRAND_MARK} style={styles.mark} testID="brand-mark" />
              <Text accessibilityRole="header" variant="headlineMedium">
                {t('app.gatewayCheck.title')}
              </Text>
              <Text style={[styles.centered, { color: colors.onSurfaceVariant }]} variant="bodyMedium">
                {t('app.signIn.intro')}
              </Text>
            </View>

            <View>
              <TextInput
                autoCapitalize="none"
                autoComplete="url"
                autoCorrect={false}
                error={urlProblem}
                inputMode="url"
                label={t('settings.connections.urlTitle')}
                mode="outlined"
                onBlur={onUrlBlur}
                onChangeText={setUrl}
                onSubmitEditing={() => usernameField.current?.focus()}
                placeholder={t('app.gatewayCheck.urlPlaceholder')}
                returnKeyType="next"
                right={urlStatus({ checking, colors, onRetry: runCheck, result: check })}
                submitBehavior="submit"
                testID="gateway-url"
                value={url}
              />
              <CheckLine checking={checking} result={check} />
            </View>

            <View style={styles.fields}>
              <TextInput
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                label={t('settings.vault.identifierTypes.username')}
                mode="outlined"
                onChangeText={setUsername}
                onSubmitEditing={() => passwordField.current?.focus()}
                ref={usernameField}
                returnKeyType="next"
                submitBehavior="submit"
                testID="username"
                textContentType="username"
                value={username}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="current-password"
                autoCorrect={false}
                label={t('settings.vault.passwordField')}
                mode="outlined"
                onChangeText={setPassword}
                onSubmitEditing={canSubmit ? submit : undefined}
                ref={passwordField}
                returnKeyType="go"
                right={
                  <TextInput.Icon
                    accessibilityLabel={showPassword ? t('app.signIn.hidePassword') : t('app.signIn.showPassword')}
                    icon={showPassword ? 'eye-off' : 'eye'}
                    onPress={() => setShowPassword(!showPassword)}
                    testID="show-password"
                  />
                }
                secureTextEntry={!showPassword}
                testID="password"
                textContentType="password"
                value={password}
              />
            </View>

            <View style={styles.remember}>
              <Text style={styles.flex} variant="bodyMedium">
                {t('app.signIn.rememberPassword')}
              </Text>
              <Switch accessibilityLabel={t('app.signIn.rememberPassword')} onValueChange={setRemember} testID="remember-password" value={remember} />
            </View>

            {error ? (
              <View style={[styles.error, { backgroundColor: colors.errorContainer }]}>
                <Icon color={colors.error} size={18} source="alert-circle" />
                <Text accessibilityRole="alert" style={[styles.flex, { color: colors.onErrorContainer }]} testID="sign-in-error" variant="bodyMedium">
                  {error}
                </Text>
              </View>
            ) : null}

            <Button contentStyle={styles.buttonContent} disabled={!canSubmit} loading={signingIn} mode="contained" onPress={submit} testID="sign-in">
              {signingIn ? t('app.signIn.signingIn') : t('settings.gateway.signIn')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/**
 * The end of the URL field: what the check found, or a retry when the gateway
 * couldn't be reached. A function, not a component: Paper only lays out a
 * `right` element as an icon when it is a `TextInput.Icon` itself.
 */
function urlStatus({
  checking,
  colors,
  onRetry,
  result
}: {
  checking: boolean
  colors: { error: string; primary: string }
  onRetry: () => void
  result: GatewayCheck | null
}) {
  if (checking) {
    return <TextInput.Icon key="checking" forceTextInputFocus={false} icon={() => <ActivityIndicator size={18} />} importantForAccessibility="no" testID="gateway-checking" />
  }

  switch (result?.kind) {
    case undefined:
      return null
    case 'gateway':
      return <TextInput.Icon key="found" color={colors.primary} forceTextInputFocus={false} icon="check-circle" importantForAccessibility="no" testID="gateway-found" />
    case 'unreachable':
      return <TextInput.Icon key="retry" accessibilityLabel={t('common.retry')} icon="refresh" onPress={onRetry} testID="gateway-retry" />
    case 'not-a-gateway':
    case 'invalid-url':
      return <TextInput.Icon key="problem" color={colors.error} forceTextInputFocus={false} icon="alert-circle" importantForAccessibility="no" />
  }
}

/** The line under the URL field. Empty until the first check, but always there. */
function CheckLine({ checking, result }: { checking: boolean; result: GatewayCheck | null }) {
  const message = (() => {
    if (checking) {
      return t('app.gatewayCheck.checking')
    }

    switch (result?.kind) {
      case undefined:
        return ''
      case 'gateway':
        return t('app.gatewayCheck.version', { version: result.version })
      case 'unreachable':
        return t('app.gatewayCheck.unreachable')
      case 'not-a-gateway':
        return t('app.gatewayCheck.notAGateway')
      case 'invalid-url':
        return t('app.gatewayCheck.invalidUrl')
    }
  })()

  return (
    <HelperText type={!checking && result && result.kind !== 'gateway' ? 'error' : 'info'} visible>
      {message}
    </HelperText>
  )
}

const styles = StyleSheet.create({
  buttonContent: { height: 48 },
  centered: { textAlign: 'center' },
  column: { alignSelf: 'center', gap: space.screen, maxWidth: 440, width: '100%' },
  error: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: space.listGap, padding: space.screen },
  fields: { gap: space.screen },
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', gap: space.step, marginBottom: space.screen },
  mark: { borderRadius: 14, height: 64, marginBottom: space.listGap, width: 64 },
  remember: { alignItems: 'center', flexDirection: 'row', gap: space.listGap, paddingLeft: space.step },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.screen * 2 }
})
