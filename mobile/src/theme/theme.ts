import { mix } from '@hermes/shared/color'
import { THEME_PRESET_PALETTES, type ThemePresetColors } from '@hermes/shared/theme-presets'
import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper'

import { typeScale } from './compact'

/** The desktop's default theme. The app takes its colours from it, never from a copy. */
const HERMES_THEME = THEME_PRESET_PALETTES.nous

export type ColorScheme = 'light' | 'dark'

/** Paper's Material 3 theme, plus the Hermes colours Material 3 has no role for. */
export type HermesTheme = MD3Theme & {
  colors: MD3Theme['colors'] & {
    /** Hermes `card`: cards, sheets and other raised areas. */
    surfaceContainer: string
    userBubble: string
    userBubbleBorder: string
  }
}

export function hermesPalette(scheme: ColorScheme): ThemePresetColors {
  return scheme === 'dark' ? (HERMES_THEME.darkColors ?? HERMES_THEME.colors) : HERMES_THEME.colors
}

export function hermesTheme(scheme: ColorScheme): HermesTheme {
  const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme
  const c = hermesPalette(scheme)
  const container = c.card

  return {
    ...base,
    dark: scheme === 'dark',
    fonts: configureFonts({ config: typeScale }),
    colors: {
      ...base.colors,
      primary: c.primary,
      onPrimary: c.primaryForeground,
      primaryContainer: c.secondary,
      onPrimaryContainer: c.secondaryForeground,
      secondary: c.midground ?? c.primary,
      onSecondary: c.midgroundForeground ?? c.primaryForeground,
      secondaryContainer: c.accent,
      onSecondaryContainer: c.accentForeground,
      tertiary: c.primary,
      onTertiary: c.primaryForeground,
      tertiaryContainer: c.accent,
      onTertiaryContainer: c.accentForeground,
      background: c.background,
      onBackground: c.foreground,
      surface: c.background,
      onSurface: c.foreground,
      surfaceVariant: c.muted,
      onSurfaceVariant: c.mutedForeground,
      surfaceDisabled: mix(c.background, c.foreground, 0.12),
      onSurfaceDisabled: mix(c.background, c.foreground, 0.38),
      outline: c.border,
      outlineVariant: c.border,
      error: c.destructive,
      onError: c.destructiveForeground,
      errorContainer: mix(c.background, c.destructive, 0.15),
      onErrorContainer: c.foreground,
      inverseSurface: c.foreground,
      inverseOnSurface: c.background,
      inversePrimary: c.primary,
      elevation: {
        level0: 'transparent',
        level1: container,
        level2: container,
        level3: container,
        level4: container,
        level5: container
      },
      surfaceContainer: container,
      userBubble: c.userBubble ?? c.secondary,
      userBubbleBorder: c.userBubbleBorder ?? c.border
    }
  }
}
