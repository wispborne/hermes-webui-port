## 1. App config

- [ ] 1.1 Add `mobile/app.config.ts`: development variant (`com.wispborne.hermes.dev`, "Hermes Dev", `hermes-dev`) and `versionCode` from the version, failing on parts outside 0–99
- [ ] 1.2 Set `APP_VARIANT=development` in the `android` npm script, and update the README's build steps
- [ ] 1.3 Add `expo-build-properties` with `usesCleartextTraffic: true`
- [ ] 1.4 Tests for the variant values and the `versionCode` rule, including the out-of-range error

## 2. Signing

- [ ] 2.1 Write `mobile/plugins/with-release-signing.js`: a `release` signing config from the four Gradle properties, falling back to the debug key
- [ ] 2.2 Test the plugin's change to a sample `build.gradle`, with and without the properties
- [ ] 2.3 Write `mobile/scripts/release-key-wizard.sh` (make the keystore, print the base64, add the four Gitea secrets, back up in the password manager, delete the local copy)

## 3. Workflow

- [ ] 3.1 Write `.github/workflows/mobile-release.yml`: version and tag check, setup, type check and tests, prebuild, signed `assembleRelease` for `arm64-v8a`, signature check, notes, tag, Gitea release with the APK, tag removal on failure
- [ ] 3.2 Add `themes.generated.json` to the generated-files check in `mobile.yml`
- [ ] 3.3 Build a release locally with a throwaway key and check its `versionCode`, app ID, signature, and that it reaches an `http://` gateway on the emulator

## 4. README

- [ ] 4.1 Add "Install with Obtainium": the Gitea URL, the `^Hermes mobile` title filter, the `hermes-.*\.apk` APK filter, and the one-time uninstall of the old development build

## 5. Done

- [ ] 5.1 Type check and tests pass
- [ ] 5.2 The owner runs the wizard and adds the secrets
- [ ] 5.3 The owner bumps the version to 0.2.0, and the Gitea run makes the release
- [ ] 5.4 The owner uninstalls the old development build, adds the app to Obtainium, installs 0.2.0 and signs in
- [ ] 5.5 The owner bumps to 0.2.1, and Obtainium installs it as an update with sign-in kept

## Notes
