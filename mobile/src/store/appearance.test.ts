import { memorySettingsStore, setSettingsStoreForTests } from '@/storage/app-settings'

// The store reads the saved settings when it's first imported, so the settings
// store in memory has to be in place before that.
setSettingsStoreForTests(memorySettingsStore())

const { $appearance, reloadAppearance, schemeFor, setAppearance } = require('./appearance') as typeof import('./appearance')

describe('appearance', () => {
  beforeEach(() => {
    setSettingsStoreForTests(memorySettingsStore())
    reloadAppearance()
  })

  it('starts as System, nous and Theme default', () => {
    expect($appearance.get()).toEqual({ colorMode: 'system', themeName: 'nous', accent: null })
  })

  it('comes back after the app restarts', () => {
    setAppearance({ colorMode: 'dark', themeName: 'everforest', accent: 'pink' })
    $appearance.set({ colorMode: 'system', themeName: 'nous', accent: null })
    reloadAppearance()

    expect($appearance.get()).toEqual({ colorMode: 'dark', themeName: 'everforest', accent: 'pink' })
  })

  it('goes back to Theme default', () => {
    setAppearance({ accent: 'pink' })
    setAppearance({ accent: null })
    reloadAppearance()

    expect($appearance.get().accent).toBeNull()
  })

  it('follows the phone only for System', () => {
    expect(schemeFor('system', 'dark')).toBe('dark')
    expect(schemeFor('system', 'light')).toBe('light')
    expect(schemeFor('system', null)).toBe('light')
    expect(schemeFor('light', 'dark')).toBe('light')
    expect(schemeFor('dark', 'light')).toBe('dark')
  })
})
