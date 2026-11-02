import { loadAppSettings, memorySettingsStore, saveAppSettings, setSettingsStoreForTests } from './app-settings'

describe('notification choices', () => {
  it('start with every kind on, and keep the kinds turned off', () => {
    const store = memorySettingsStore()
    setSettingsStoreForTests(store)

    expect(loadAppSettings().notify).toEqual({})

    saveAppSettings({ notify: { turnDone: false, approval: true, turnError: false } })

    expect(store.values.get('notify_off')).toBe('turnDone,turnError')
    expect(loadAppSettings().notify).toEqual({ turnDone: false, turnError: false })
  })
})
