import { SQLiteStorage } from 'expo-sqlite/kv-store'

/**
 * Settings that belong to the app, not to one gateway: the last gateway URL
 * and the username, used to fill in Sign in, and the appearance. They are kept
 * when a gateway's data is deleted on sign-out. The password is never saved
 * here or anywhere.
 */
export interface AppSettings {
  gatewayUrl: string | null
  username: string | null
  /** "Keep connected" is on. */
  keepConnected?: boolean
  /** The notification and battery requests were explained and asked once. */
  backgroundAsked?: boolean
  /** Appearance: Light, Dark, or follow the phone. */
  colorMode?: ColorMode
  /** Appearance: a theme name from the shared palettes. */
  themeName?: string | null
  /** Appearance: a desktop accent swatch id, or null for the theme's own accent. */
  accent?: string | null
}

export type ColorMode = 'light' | 'dark' | 'system'

const COLOR_MODES: readonly ColorMode[] = ['light', 'dark', 'system']

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

const KEYS = {
  gatewayUrl: 'gateway_url',
  username: 'username',
  keepConnected: 'keep_connected',
  backgroundAsked: 'background_asked',
  colorMode: 'color_mode',
  themeName: 'theme_name',
  accent: 'accent'
} as const

export function loadAppSettings(): AppSettings {
  const read = (name: keyof typeof KEYS) => settingsStore().getItemSync(KEYS[name])

  return {
    gatewayUrl: read('gatewayUrl'),
    username: read('username'),
    keepConnected: read('keepConnected') === 'true',
    backgroundAsked: read('backgroundAsked') === 'true',
    colorMode: COLOR_MODES.find(mode => mode === read('colorMode')) ?? 'system',
    themeName: read('themeName'),
    accent: read('accent')
  }
}

export function saveAppSettings(settings: Partial<AppSettings>) {
  for (const [name, value] of Object.entries(settings) as [keyof AppSettings, string | boolean | null | undefined][]) {
    if (value === undefined) {
      continue
    }

    if (value === null) {
      settingsStore().removeItemSync(KEYS[name])
    } else {
      settingsStore().setItemSync(KEYS[name], String(value))
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
