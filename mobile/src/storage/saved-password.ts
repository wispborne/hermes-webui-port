import * as SecureStore from 'expo-secure-store'

/**
 * The gateway password, when the person asked the phone to remember it, so
 * the app can sign in again by itself when the gateway ends the session.
 *
 * It lives in expo-secure-store, never in the app settings: on Android the
 * value is encrypted with a key held in the Android Keystore, and the
 * expo-secure-store config plugin keeps it out of Android's backups. It is
 * kept for one gateway URL and username, and is only handed back for those.
 */
export interface PasswordStore {
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>
}

const KEY = 'gateway_password'

// iOS: readable after the first unlock, so a sign-in from the background works; never synced off this device.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }

let store: PasswordStore = SecureStore

/** Tests swap in a store in memory. */
export function setPasswordStoreForTests(replacement: PasswordStore) {
  store = replacement
}

interface Saved {
  url: string
  username: string
  password: string
}

export async function savePassword(url: string, username: string, password: string): Promise<void> {
  await store.setItemAsync(KEY, JSON.stringify({ url, username, password } satisfies Saved), OPTIONS)
}

/** The saved password for this gateway and username, or null. A value that can't be read is deleted. */
export async function loadPassword(url: string, username: string): Promise<string | null> {
  try {
    const raw = await store.getItemAsync(KEY, OPTIONS)
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null

    return saved?.url === url && saved.username === username && typeof saved.password === 'string' ? saved.password : null
  } catch {
    // The Keystore key can be lost, for example when the lock screen is removed. The value is useless then.
    await forgetPassword()

    return null
  }
}

export async function forgetPassword(): Promise<void> {
  await store.deleteItemAsync(KEY, OPTIONS).catch(() => undefined)
}
