import { requireOptionalNativeModule } from 'expo-modules-core'

interface HermesBackgroundNative {
  flushCookies(): void
  clearCookies(): Promise<void>
  startService(title: string, text: string): void
  updateService(title: string, text: string): void
  stopService(): void
  isServiceRunning(): boolean
  setKeepConnected(keepConnected: boolean, title: string, text: string): void
  isIgnoringBatteryOptimizations(): boolean
  requestIgnoreBatteryOptimizations(): void
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

/**
 * Starts the foreground service that keeps the app, and its connection, alive
 * off screen, with an ongoing notification. Android only allows this while the
 * app is on screen (or just leaving it).
 */
export function startService(title: string, text: string) {
  native?.startService(title, text)
}

/** Changes the ongoing notification's words. Does nothing when the service isn't running. */
export function updateService(title: string, text: string) {
  native?.updateService(title, text)
}

export function stopService() {
  native?.stopService()
}

export function isServiceRunning(): boolean {
  return native?.isServiceRunning() ?? false
}

/** Remembers "Keep connected" (and the notification's words) for starting again after a reboot. */
export function setKeepConnected(keepConnected: boolean, title: string, text: string) {
  native?.setKeepConnected(keepConnected, title, text)
}

export function isIgnoringBatteryOptimizations(): boolean {
  return native?.isIgnoringBatteryOptimizations() ?? true
}

/** Opens Android's request to let the app run without battery restrictions. */
export function requestIgnoreBatteryOptimizations() {
  native?.requestIgnoreBatteryOptimizations()
}
