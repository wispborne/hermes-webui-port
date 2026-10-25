import { resolveAccentPick } from '@hermes/desktop-themes/accents'
import { retintTheme } from '@hermes/desktop-themes/retint'
import { mix } from '@hermes/shared/color'
import { THEME_PRESET_PALETTES, type ThemePresetColors, type ThemePresetPalette } from '@hermes/shared/theme-presets'
import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper'

import { typeScale } from './compact'
import { drawablePalette } from './css-color'

/** The desktop's default theme. */
export const DEFAULT_THEME_NAME = 'nous'

export type ColorScheme = 'light' | 'dark'

/** The theme and accent picked in Settings. `accent` is a desktop swatch id, or null for the theme's own. */
export interface ThemeChoice {
  themeName?: string
  accent?: string | null
}

/** Paper's Material 3 theme, plus the Hermes colours Material 3 has no role for. */
export type HermesTheme = MD3Theme & {
  colors: MD3Theme['colors'] & {
    /** Hermes `card`: cards, sheets and other raised areas. */
    surfaceContainer: string
    userBubble: string
    userBubbleBorder: string
  }
}

const PALETTES: Record<string, ThemePresetPalette> = THEME_PRESET_PALETTES

/**
 * The palette for one mode of a theme, from the shared palettes, never from a
 * copy. An accent is applied with the desktop's own recolouring. A theme name
 * that no longer exists falls back to the default theme.
 */
export function hermesPalette(scheme: ColorScheme, { themeName, accent }: ThemeChoice = {}): ThemePresetColors {
  const name = themeName && themeName in PALETTES ? themeName : DEFAULT_THEME_NAME
  const preset = PALETTES[name]!
  // Android can't draw `color-mix()`, and the recolouring can't read it either.
  let palette: ThemePresetPalette = {
    colors: drawablePalette(preset.colors),
    darkColors: preset.darkColors && drawablePalette(preset.darkColors)
  }

  // A swatch paints differently in light and dark (Mono), so it's resolved for
  // the mode being drawn, as the desktop does when it's picked.
  const seed = accent ? resolveAccentPick(accent, scheme === 'dark')?.hex : null

  if (seed) {
    palette = retintTheme({ name, label: name, description: '', ...palette }, seed)
  }

  return scheme === 'dark' ? (palette.darkColors ?? palette.colors) : palette.colors
}

export function hermesTheme(scheme: ColorScheme, choice: ThemeChoice = {}): HermesTheme {
  const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme
  const c = hermesPalette(scheme, choice)
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
