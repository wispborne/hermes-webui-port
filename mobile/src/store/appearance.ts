import { atom } from 'nanostores'

import { type ColorMode, loadAppSettings, saveAppSettings } from '@/storage/app-settings'
import { type ColorScheme, DEFAULT_THEME_NAME } from '@/theme/theme'

/** Color Mode, Theme and Accent color from Settings. Saved on the phone, never sent to the gateway. */
export interface Appearance {
  colorMode: ColorMode
  themeName: string
  /** A desktop accent swatch id, or null for the theme's own accent. */
  accent: string | null
}

function loadAppearance(): Appearance {
  const saved = loadAppSettings()

  return {
    colorMode: saved.colorMode ?? 'system',
    themeName: saved.themeName ?? DEFAULT_THEME_NAME,
    accent: saved.accent ?? null
  }
}

export const $appearance = atom<Appearance>(loadAppearance())

export function setAppearance(change: Partial<Appearance>) {
  saveAppSettings(change)
  $appearance.set({ ...$appearance.get(), ...change })
}

/** Reads the saved appearance again. Tests use it after swapping the settings store. */
export function reloadAppearance() {
  $appearance.set(loadAppearance())
}

/** Light or dark to draw, given Color Mode and the phone's own setting. */
export function schemeFor(colorMode: ColorMode, phone: string | null | undefined): ColorScheme {
  return colorMode === 'system' ? (phone === 'dark' ? 'dark' : 'light') : colorMode
}
