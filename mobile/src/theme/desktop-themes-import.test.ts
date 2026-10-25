// The app imports these desktop theme files directly. If an upstream sync gives
// one of them an import that only the desktop can load, this test fails.
import * as accents from '@hermes/desktop-themes/accents'
import * as color from '@hermes/desktop-themes/color'
import * as retint from '@hermes/desktop-themes/retint'
import type { DesktopTheme } from '@hermes/desktop-themes/types'

describe('desktop theme files', () => {
  it('load in React Native', () => {
    const theme: Pick<DesktopTheme, 'name'> = { name: 'nous' }

    expect(theme.name).toBe('nous')
    expect(accents.ACCENT_SWATCH_IDS.length).toBeGreaterThan(0)
    expect(typeof color.normalizeHex).toBe('function')
    expect(typeof retint.retintTheme).toBe('function')
  })
})
