const { addReleaseSigning } = require('./with-release-signing') as { addReleaseSigning: (contents: string) => string }

// The signing part of Expo's android/app/build.gradle template.
const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`

describe('addReleaseSigning', () => {
  it('adds a release signing config read from the Gradle properties', () => {
    const result = addReleaseSigning(TEMPLATE)

    expect(result).toContain(`        if (findProperty('hermesKeystore')) {
            release {
                storeFile file(findProperty('hermesKeystore'))
                storePassword findProperty('hermesKeystorePassword')
                keyAlias findProperty('hermesKeyAlias')
                keyPassword findProperty('hermesKeyPassword')
            }
        }
    }
    buildTypes {`)
  })

  it('signs release builds with it when the properties are given, and with the debug key otherwise', () => {
    const result = addReleaseSigning(TEMPLATE)

    expect(result).toContain(
      "signingConfig findProperty('hermesKeystore') ? signingConfigs.release : signingConfigs.debug\n            minifyEnabled"
    )
    // Debug builds keep the debug key.
    expect(result).toContain('        debug {\n            signingConfig signingConfigs.debug\n        }')
  })

  it('changes nothing the second time', () => {
    const once = addReleaseSigning(TEMPLATE)

    expect(addReleaseSigning(once)).toBe(once)
  })

  it('fails when the template has changed', () => {
    expect(() => addReleaseSigning('android {}')).toThrow("Expo's template has changed")
  })
})
