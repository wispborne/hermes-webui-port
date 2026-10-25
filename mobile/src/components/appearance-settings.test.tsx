import { useStore } from '@nanostores/react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { memorySettingsStore, setSettingsStoreForTests } from '@/storage/app-settings'
import { hermesPalette, hermesTheme } from '@/theme/theme'
import { useHermesTheme } from '@/theme/use-hermes-theme'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }))

// The appearance store reads the saved settings when it's first imported.
setSettingsStoreForTests(memorySettingsStore())

const { $appearance, reloadAppearance, schemeFor } = require('@/store/appearance') as typeof import('@/store/appearance')
const { AppearanceSettings } = require('./appearance-settings') as typeof import('./appearance-settings')
const { ThemeScreen } = require('@/screens/theme-screen') as typeof import('@/screens/theme-screen')
const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }

const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

/** Shows the primary colour the app is drawing with. */
function Probe() {
  const { colors, dark } = useHermesTheme()

  return <Text testID="probe">{`${dark ? 'dark' : 'light'} ${colors.primary}`}</Text>
}

/** Builds the theme from the store the way the root layout does, with the phone in light mode. */
function Themed({ children }: { children: React.ReactNode }) {
  const { accent, colorMode, themeName } = useStore($appearance)
  const theme = hermesTheme(schemeFor(colorMode, 'light'), { themeName, accent })

  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider theme={theme}>
        {children}
        <Probe />
      </PaperProvider>
    </SafeAreaProvider>
  )
}

beforeEach(() => {
  setSettingsStoreForTests(memorySettingsStore())
  reloadAppearance()
})

const probe = () => screen.getByTestId('probe').props.children as string

describe('AppearanceSettings', () => {
  it('switches Color Mode at once', async () => {
    await render(<Themed><AppearanceSettings /></Themed>)
    expect(probe()).toBe(`light ${hermesPalette('light').primary}`)

    await fireEvent.press(screen.getByTestId('color-mode-dark'))

    expect($appearance.get().colorMode).toBe('dark')
    expect(probe()).toBe(`dark ${hermesPalette('dark').primary}`)
  })

  it('recolours the app with an accent, and goes back with Theme default', async () => {
    await render(<Themed><AppearanceSettings /></Themed>)

    await fireEvent.press(screen.getByTestId('accent-pink'))
    expect($appearance.get().accent).toBe('pink')
    expect(probe()).toBe(`light ${hermesPalette('light', { accent: 'pink' }).primary}`)

    await fireEvent.press(screen.getByTestId('accent-theme'))
    expect($appearance.get().accent).toBeNull()
    expect(probe()).toBe(`light ${hermesPalette('light').primary}`)
  })

  it('has no separate Nous blue swatch', async () => {
    await render(<Themed><AppearanceSettings /></Themed>)

    expect(screen.queryByTestId('accent-nous')).toBeNull()
  })

  it('opens the theme list', async () => {
    await render(<Themed><AppearanceSettings /></Themed>)

    await fireEvent.press(screen.getByTestId('theme-row'))

    expect(router.push).toHaveBeenCalledWith('/settings/theme')
  })
})

describe('ThemeScreen', () => {
  it('checks the current theme and applies a picked one at once', async () => {
    await render(<Themed><ThemeScreen /></Themed>)
    expect(screen.getByTestId('theme-nous').props.accessibilityState).toMatchObject({ selected: true })

    await fireEvent.press(screen.getByTestId('theme-catppuccin'))

    expect($appearance.get().themeName).toBe('catppuccin')
    expect(probe()).toBe(`light ${hermesPalette('light', { themeName: 'catppuccin' }).primary}`)
    expect(screen.getByTestId('theme-catppuccin').props.accessibilityState).toMatchObject({ selected: true })
  })
})
