// Signs release builds with the Hermes release key when the build is given it.
//
// The key comes from four Gradle properties. The release workflow
// (.github/workflows/mobile-release.yml) sets them as ORG_GRADLE_PROJECT_<name>
// environment variables, which Gradle reads as properties:
//
//   hermesKeystore          path to the keystore file
//   hermesKeystorePassword  the keystore's password
//   hermesKeyAlias          the key's alias in the keystore
//   hermesKeyPassword       the key's password
//
// Without them, as on a developer's machine, release builds use the debug key,
// as Expo's template does.

const { withAppBuildGradle } = require('expo/config-plugins')

const MARK = 'hermesKeystore'

const DEBUG_SIGNING = /(signingConfigs \{\n(\s+)debug \{[^}]*\}\n)/
const RELEASE_USES_DEBUG = /(release \{\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/

/** build.gradle with a release signing config from the four properties. Throws if the template has changed. */
function addReleaseSigning(contents) {
  if (contents.includes(MARK)) {
    return contents
  }

  if (!DEBUG_SIGNING.test(contents) || !RELEASE_USES_DEBUG.test(contents)) {
    throw new Error(
      "with-release-signing: android/app/build.gradle doesn't have the signing blocks this plugin expects. Expo's template has changed; update the plugin."
    )
  }

  return contents
    .replace(DEBUG_SIGNING, (_, debugBlock, indent) =>
      [
        debugBlock.trimEnd(),
        `${indent}if (findProperty('hermesKeystore')) {`,
        `${indent}    release {`,
        `${indent}        storeFile file(findProperty('hermesKeystore'))`,
        `${indent}        storePassword findProperty('hermesKeystorePassword')`,
        `${indent}        keyAlias findProperty('hermesKeyAlias')`,
        `${indent}        keyPassword findProperty('hermesKeyPassword')`,
        `${indent}    }`,
        `${indent}}`,
        ''
      ].join('\n')
    )
    .replace(
      RELEASE_USES_DEBUG,
      "$1signingConfig findProperty('hermesKeystore') ? signingConfigs.release : signingConfigs.debug"
    )
}

const withReleaseSigning = config =>
  withAppBuildGradle(config, gradle => {
    gradle.modResults.contents = addReleaseSigning(gradle.modResults.contents)

    return gradle
  })

module.exports = withReleaseSigning
module.exports.addReleaseSigning = addReleaseSigning
