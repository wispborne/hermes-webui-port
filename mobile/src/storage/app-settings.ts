import { SQLiteStorage } from 'expo-sqlite/kv-store'

/**
 * Settings that belong to the app, not to one gateway: the last gateway URL
 * and the username, used to fill in Sign in, and the appearance. They are kept
 * when a gateway's data is deleted on sign-out. The password is never saved
 * here: a remembered password lives in secure storage (saved-password.ts).
 */
export interface AppSettings {
  gatewayUrl: string | null
  username: string | null
  /** "Remember password" on Sign in. On unless the person turned it off. */
  rememberPassword?: boolean
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
  /** Sessions: scheduled job deliveries are left out of the list. */
  hideScheduled?: boolean
  /** Notifications: the kinds turned off. Every kind is on unless turned off. */
  notify?: Partial<Record<NotificationKind, boolean>>
}

/** The notifications the phone raises, named as the desktop's settings name them. */
export type NotificationKind = 'approval' | 'input' | 'turnDone' | 'turnError'

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['approval', 'input', 'turnDone', 'turnError']

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
  rememberPassword: 'remember_password',
  keepConnected: 'keep_connected',
  backgroundAsked: 'background_asked',
  colorMode: 'color_mode',
  themeName: 'theme_name',
  accent: 'accent',
  hideScheduled: 'hide_scheduled',
  notify: 'notify_off'
} as const

export function loadAppSettings(): AppSettings {
  const read = (name: keyof typeof KEYS) => settingsStore().getItemSync(KEYS[name])

  return {
    gatewayUrl: read('gatewayUrl'),
    username: read('username'),
    rememberPassword: read('rememberPassword') !== 'false',
    keepConnected: read('keepConnected') === 'true',
    backgroundAsked: read('backgroundAsked') === 'true',
    colorMode: COLOR_MODES.find(mode => mode === read('colorMode')) ?? 'system',
    themeName: read('themeName'),
    accent: read('accent'),
    hideScheduled: read('hideScheduled') === 'true',
    notify: Object.fromEntries((read('notify') ?? '').split(',').filter(kind => NOTIFICATION_KINDS.includes(kind as NotificationKind)).map(kind => [kind, false]))
  }
}

export function saveAppSettings(settings: Partial<AppSettings>) {
  for (const [name, setting] of Object.entries(settings) as [keyof AppSettings, AppSettings[keyof AppSettings]][]) {
    // The kinds turned off are kept as a list, such as "turnDone,turnError".
    const value =
      typeof setting === 'object' && setting !== null
        ? NOTIFICATION_KINDS.filter(kind => (setting as Record<string, boolean>)[kind] === false).join(',')
        : setting

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
