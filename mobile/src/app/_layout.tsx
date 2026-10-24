import { useStore } from '@nanostores/react'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { BackgroundPermissionDialogs } from '@/background/permission-dialogs'
import { $auth } from '@/store/gateway'
import { hermesTheme } from '@/theme/theme'

/** Sends the person to Sign in whenever the sign-in ends. The start check runs in index.ts. */
function useAuthRouting() {
  const auth = useStore($auth)
  const segments = useSegments() as string[]
  const onSignIn = segments[0] === 'sign-in'

  useEffect(() => {
    // The start screen redirects by itself.
    if (segments.length === 0) {
      return
    }

    if (auth.phase === 'signed-out' && !onSignIn) {
      router.replace('/sign-in')
    } else if (auth.phase === 'signed-in' && onSignIn) {
      router.replace('/sessions')
    }
  }, [auth.phase, onSignIn, segments.length])
}

export default function RootLayout() {
  useAuthRouting()

  // Follows the phone's light or dark setting, and redraws when it changes.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const theme = useMemo(() => hermesTheme(scheme), [scheme])

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme

    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surfaceContainer,
        text: theme.colors.onSurface,
        border: theme.colors.outline,
        notification: theme.colors.error
      }
    }
  }, [scheme, theme])

  return (
    <PaperProvider theme={theme}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ contentStyle: { backgroundColor: theme.colors.background }, headerShown: false }} />
        <BackgroundPermissionDialogs />
      </ThemeProvider>
    </PaperProvider>
  )
}
