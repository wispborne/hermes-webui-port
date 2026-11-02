import * as SecureStore from 'expo-secure-store'

import { gatewayKey } from './database'

/**
 * The gateway password, when the person asked the phone to remember it, so
 * the app can sign in again by itself when the gateway ends the session.
 *
 * It lives in expo-secure-store, never in the app settings: on Android the
 * value is encrypted with a key held in the Android Keystore, and the
 * expo-secure-store config plugin keeps it out of Android's backups. Each
 * gateway has its own, kept with the username, and it is only handed back
 * for that gateway and username.
 */
export interface PasswordStore {
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>
  deleteItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<void>
}

/** Before the phone kept more than one gateway, the one password had this key. */
const OLD_KEY = 'gateway_password'

/** Secure store keys may only have letters, digits, ".", "-" and "_". */
const keyFor = (url: string) => `gateway_password_${gatewayKey(url).replace(/[^a-z0-9.-]/gi, '_')}`

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
  await store.setItemAsync(keyFor(url), JSON.stringify({ url, username, password } satisfies Saved), OPTIONS)
}

async function read(key: string, url: string, username: string): Promise<string | null> {
  try {
    const raw = await store.getItemAsync(key, OPTIONS)
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null

    return saved?.url === url && saved.username === username && typeof saved.password === 'string' ? saved.password : null
  } catch {
    // The Keystore key can be lost, for example when the lock screen is removed. The value is useless then.
    await store.deleteItemAsync(key, OPTIONS).catch(() => undefined)

    return null
  }
}

/** The saved password for this gateway and username, or null. A value that can't be read is deleted. */
export async function loadPassword(url: string, username: string): Promise<string | null> {
  return (await read(keyFor(url), url, username)) ?? read(OLD_KEY, url, username)
}

/** Forgets the password saved for this gateway. */
export async function forgetPassword(url: string): Promise<void> {
  await store.deleteItemAsync(keyFor(url), OPTIONS).catch(() => undefined)

  // A password saved before the phone kept more than one gateway is for one gateway only.
  if ((await store.getItemAsync(OLD_KEY, OPTIONS).catch(() => null))?.includes(JSON.stringify(url))) {
    await store.deleteItemAsync(OLD_KEY, OPTIONS).catch(() => undefined)
  }
}
