// `URL` in the JS engine is incomplete. The gateway client and the URL checks need the full one.
import 'react-native-url-polyfill/auto'

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { hermesTheme } from '@/theme/theme'

export default function RootLayout() {
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
      </ThemeProvider>
    </PaperProvider>
  )
}
