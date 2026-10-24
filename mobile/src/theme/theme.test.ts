import { THEME_PRESET_PALETTES } from '@hermes/shared/theme-presets'

import { hermesTheme } from './theme'

const nous = THEME_PRESET_PALETTES.nous

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
        expect([role, value]).toEqual([role, expect.stringMatching(/^(#[0-9a-f]{6}|rgba?\(.*\))$/i)])
      }
    }
  })

  it('sets body text to 14 sp', () => {
    expect(hermesTheme('light').fonts.bodyMedium.fontSize).toBe(14)
    expect(hermesTheme('light').fonts.bodyLarge.fontSize).toBe(14)
  })
})
