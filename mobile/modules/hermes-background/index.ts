import { requireOptionalNativeModule } from 'expo-modules-core'

interface HermesBackgroundNative {
  flushCookies(): void
  clearCookies(): Promise<void>
}

// Missing in tests and in a build made before this module existed. The calls
// then do nothing.
const native = requireOptionalNativeModule<HermesBackgroundNative>('HermesBackground')

/** Writes the system cookie store to disk now. */
export function flushCookies() {
  native?.flushCookies()
}

/** Deletes every cookie in the system cookie store, which holds only the gateway's. */
export async function clearCookies() {
  await native?.clearCookies()
}
