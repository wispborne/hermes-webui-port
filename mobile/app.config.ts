// The app's config is app.json. This file changes it for the build variant and
// works out Android's version number from the version.
//
// APP_VARIANT=development (set by `npm run android`) makes "Hermes Dev", with
// its own app ID, so it installs next to the release app instead of replacing it.

import type { ConfigContext, ExpoConfig } from 'expo/config'

const DEV_SUFFIX = '.dev'

/**
 * Android's versionCode for a `major.minor.patch` version: 1.2.3 becomes 10203.
 * Each part must be a whole number from 0 to 99, or later versions could get a
 * smaller number than earlier ones.
 */
export function versionCodeFor(version: string): number {
  const parts = version.split('.')

  if (parts.length !== 3) {
    throw new Error(`The version "${version}" must have three parts, like 1.2.3.`)
  }

  const names = ['major', 'minor', 'patch']

  const numbers = parts.map((part, index) => {
    const value = Number(part)

    if (!/^\d+$/.test(part) || value > 99) {
      throw new Error(`The ${names[index]} part of the version "${version}" must be a whole number from 0 to 99.`)
    }

    return value
  })

  return numbers[0]! * 10000 + numbers[1]! * 100 + numbers[2]!
}

/** app.json's config for the given variant, with the versionCode filled in. */
export function configFor(config: ExpoConfig, variant: string | undefined): ExpoConfig {
  const versionCode = versionCodeFor(config.version ?? '')

  if (variant !== 'development') {
    return { ...config, android: { ...config.android, versionCode } }
  }

  return {
    ...config,
    name: `${config.name} Dev`,
    scheme: `${config.scheme}-dev`,
    android: { ...config.android, versionCode, package: `${config.android?.package}${DEV_SUFFIX}` },
    ios: { ...config.ios, bundleIdentifier: `${config.ios?.bundleIdentifier}${DEV_SUFFIX}` }
  }
}

export default ({ config }: ConfigContext): ExpoConfig => configFor(config as ExpoConfig, process.env.APP_VARIANT)
