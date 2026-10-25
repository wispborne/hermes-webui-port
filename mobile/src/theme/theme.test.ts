import { ACCENT_SWATCH_IDS } from '@hermes/desktop-themes/accents'
import { THEME_PRESET_PALETTES } from '@hermes/shared/theme-presets'

import { hermesPalette, hermesTheme } from './theme'
import themes from './themes.generated.json'

const nous = THEME_PRESET_PALETTES.nous
const DRAWABLE = /^(#[0-9a-f]{6}|rgba?\(.*\))$/i

describe('hermesTheme', () => {
  it('takes the primary colour from the nous palette', () => {
    expect(hermesTheme('light').colors.primary).toBe(nous.colors.primary)
    expect(hermesTheme('dark').colors.primary).toBe(nous.darkColors.primary)
  })

  it('maps the Hermes slots to Material 3 roles', () => {
    const { colors } = hermesTheme('dark')

    expect(colors.surface).toBe(nous.darkColors.background)
    expect(colors.surfaceContainer).toBe(nous.darkColors.card)
    expect(colors.surfaceVariant).toBe(nous.darkColors.muted)
    expect(colors.outline).toBe(nous.darkColors.border)
    expect(colors.error).toBe(nous.darkColors.destructive)
    expect(colors.userBubble).toBe(nous.darkColors.userBubble)
  })

  it('uses hex colours React Native can draw', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const { elevation, ...colors } = hermesTheme(scheme).colors

      for (const [role, value] of Object.entries({ ...colors, ...elevation })) {
        if (role === 'level0') continue
        expect([role, value]).toEqual([role, expect.stringMatching(DRAWABLE)])
      }
    }
  })

  it('draws every slot of every theme, in both modes, with every accent', () => {
    for (const { name } of themes) {
      for (const accent of [null, ...ACCENT_SWATCH_IDS]) {
        for (const scheme of ['light', 'dark'] as const) {
          const { elevation, ...colors } = hermesTheme(scheme, { themeName: name, accent }).colors

          for (const [role, value] of Object.entries({ ...colors, ...elevation })) {
            if (role === 'level0') continue
            expect([name, accent, scheme, role, value]).toEqual([
              name,
              accent,
              scheme,
              role,
              expect.stringMatching(DRAWABLE)
            ])
          }
        }
      }
    }
  })

  it('lists only themes that have a shared palette, starting with nous', () => {
    expect(themes[0]!.name).toBe('nous')

    for (const { name } of themes) {
      expect(THEME_PRESET_PALETTES).toHaveProperty(name)
    }
  })

  it('uses the theme as authored for Theme default and for Nous blue', () => {
    const own = hermesPalette('dark', { themeName: 'everforest' })

    expect(own).toEqual(THEME_PRESET_PALETTES.everforest.darkColors)
    expect(hermesPalette('dark', { themeName: 'everforest', accent: 'nous' })).toEqual(own)
  })

  it('recolours the accent with a swatch and leaves the background alone', () => {
    const own = hermesPalette('light', { themeName: 'github' })
    const pink = hermesPalette('light', { themeName: 'github', accent: 'pink' })

    expect(pink.primary).not.toBe(own.primary)
    expect(pink.background).toBe(own.background)
  })

  it('falls back to nous for a theme that no longer exists', () => {
    expect(hermesPalette('light', { themeName: 'gone' })).toEqual(hermesPalette('light'))
  })

  it('sets body text to 14 sp', () => {
    expect(hermesTheme('light').fonts.bodyMedium.fontSize).toBe(14)
    expect(hermesTheme('light').fonts.bodyLarge.fontSize).toBe(14)
  })
})
