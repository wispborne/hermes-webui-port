import { SQLiteStorage } from 'expo-sqlite/kv-store'

/**
 * Settings that belong to the app, not to one gateway: the last gateway URL
 * and the username, used to fill in Sign in. They are kept when a gateway's
 * data is deleted on sign-out. The password is never saved here or anywhere.
 */
export interface AppSettings {
  gatewayUrl: string | null
  username: string | null
}

export interface SettingsStore {
  getItemSync(key: string): string | null
  setItemSync(key: string, value: string): void
  removeItemSync(key: string): boolean
}

let store: SettingsStore | null = null

const settingsStore = () => (store ??= new SQLiteStorage('app-settings.db'))

/** Tests swap in a store in memory. */
export function setSettingsStoreForTests(replacement: SettingsStore) {
  store = replacement
}

const KEYS = { gatewayUrl: 'gateway_url', username: 'username' } as const

export function loadAppSettings(): AppSettings {
  return {
    gatewayUrl: settingsStore().getItemSync(KEYS.gatewayUrl),
    username: settingsStore().getItemSync(KEYS.username)
  }
}

export function saveAppSettings(settings: Partial<AppSettings>) {
  for (const [name, value] of Object.entries(settings) as [keyof AppSettings, string | null | undefined][]) {
    if (value === undefined) {
      continue
    }

    if (value === null) {
      settingsStore().removeItemSync(KEYS[name])
    } else {
      settingsStore().setItemSync(KEYS[name], value)
    }
  }
}

/** A settings store in memory, for tests. */
export function memorySettingsStore(): SettingsStore & { values: Map<string, string> } {
  const values = new Map<string, string>()

  return {
    values,
    getItemSync: key => values.get(key) ?? null,
    setItemSync: (key, value) => void values.set(key, value),
    removeItemSync: key => values.delete(key)
  }
}
