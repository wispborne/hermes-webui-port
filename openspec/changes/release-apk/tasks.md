## 1. App config

- [x] 1.1 Add `mobile/app.config.ts`: development variant (`com.wispborne.hermes.dev`, "Hermes Dev", `hermes-dev`) and `versionCode` from the version, failing on parts outside 0–99
- [x] 1.2 Set `APP_VARIANT=development` in the `android` npm script, and update the README's build steps
- [x] 1.3 Add `expo-build-properties` with `usesCleartextTraffic: true`
- [x] 1.4 Tests for the variant values and the `versionCode` rule, including the out-of-range error

## 2. Signing

- [x] 2.1 Write `mobile/plugins/with-release-signing.js`: a `release` signing config from the four Gradle properties, falling back to the debug key
- [x] 2.2 Test the plugin's change to a sample `build.gradle`, with and without the properties
- [x] 2.3 Write `mobile/scripts/release-key-wizard.sh` (make the keystore, print the base64, add the four Gitea secrets, back up in the password manager, delete the local copy)

## 3. Workflow

- [x] 3.1 Write `.github/workflows/mobile-release.yml`: version and tag check, setup, type check and tests, prebuild, signed `assembleRelease` for `arm64-v8a`, signature check, notes, tag, Gitea release with the APK, tag removal on failure
- [x] 3.2 Add `themes.generated.json` to the generated-files check in `mobile.yml`
- [x] 3.3 Build a release locally with a throwaway key and check its `versionCode`, app ID, signature, and that it reaches an `http://` gateway on the emulator

## 4. README

- [x] 4.1 Add "Install with Obtainium": the Gitea URL, the `^Hermes mobile` title filter, the `hermes-.*\.apk` APK filter, and the one-time uninstall of the old development build

## 5. Done

- [x] 5.1 Type check and tests pass
- [x] 5.2 The owner runs the wizard and adds the secrets
- [x] 5.3 The owner re-runs the Mobile release workflow on Gitea, and it makes the 0.1.0 release
- [ ] 5.4 The owner uninstalls the old development build, adds the app to Obtainium, installs 0.1.0 and signs in
- [ ] 5.5 The owner bumps to 0.1.1, and Obtainium installs it as an update with sign-in kept

## Notes

- `npm run android` and `npm start` go through `scripts/expo-dev.mjs`, which sets `APP_VARIANT=development`. An inline `APP_VARIANT=development` doesn't work in npm's shell on Windows, and `cross-env` would be a new dependency for one line.
- The workflow passes the signing values to Gradle as `ORG_GRADLE_PROJECT_<name>` environment variables, not with `-P`, so the passwords don't show in the runner's process list.
- The Gitea release is made through the API with the tag, so Gitea creates the tag. If the APK upload fails, the run deletes the release and the tag.
- 3.3 so far: a release built locally with a throwaway key (for `x86_64`, to run on the emulator) has `versionCode` 100, the ID `com.wispborne.hermes`, the label "Hermes", `usesCleartextTraffic=true`, and the throwaway key's signature. Installing it over the emulator's old development build fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, as expected. With the owner's go-ahead, the old development build was uninstalled from the emulator. The release then signed in to the demo gateway at `http://10.0.2.2:8787`, listed its sessions, sent a message over the WebSocket and showed the streamed reply (`screenshots/release-http-gateway-chat.png`). The emulator still has this test release, signed with the throwaway key.
- The push that added the workflow ran it with version 0.1.0, which had no tag yet. The run stopped at the secrets check, before making a tag. Once the secrets are added, re-running it makes 0.1.0 the first release.
- The first Gitea run failed in `android-actions/setup-android`: its default package list asks for `tools`, which SDK command-line tools 16.0 no longer have. The workflow now asks only for `platform-tools`. Gradle downloads the rest.
- The second run failed when the Gradle wrapper downloaded Gradle: "Network is unreachable". The runner's containers have no IPv6 route and Java tries IPv6 first, so the job sets `JAVA_TOOL_OPTIONS=-Djava.net.preferIPv4Stack=true`.
- The first release, 0.1.0, was 56 MB. 36 MB of that was native libraries, stored uncompressed. 16 MB was code that R8 wasn't shrinking. Shrinking is now on (see the design's Shrinking section), and 0.1.1 is the first release built with it.
- Obtainium needs the Forgejo source type (it has no Gitea option), and Gitea must let signed-out visitors use the API (`REQUIRE_SIGNIN_VIEW = expensive` or `false`). With sign-in required, the API answered 403 and Obtainium showed 429. The owner changed the setting, and Obtainium now finds the releases.
