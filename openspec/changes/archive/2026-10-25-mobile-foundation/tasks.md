## 1. Release and CI paths

- [x] 1.1 Confirm `.github/workflows/tag-release.yml` ignores `mobile/**`, `openspec/**`, `docs/**`, `CONTEXT.md` and `.github/**`

## 2. Project

- [x] 2.1 Create the Expo app in `mobile/` with the newest stable SDK, TypeScript, and expo-router (`index` route only)
- [x] 2.2 Set the app name to "Hermes" and the Android package to `com.wispborne.hermes`
- [x] 2.3 Add `npm` scripts: `typecheck`, `test`, `android` (`expo run:android`), `strings`
- [x] 2.4 Build and launch the development build on the Android emulator

## 3. Shared code

- [x] 3.1 Add the `@hermes/shared` TypeScript `paths` mapping and include `../apps/shared/src` in the type check
- [x] 3.2 Add Metro `watchFolders` and a `resolveRequest` that maps `@hermes/shared` and retries `.js` imports as `.ts`
- [x] 3.3 Add `react-native-url-polyfill` at app start
- [x] 3.4 Add a Jest test that imports `@hermes/shared` (index and `json-rpc-gateway`) under the React Native preset
- [x] 3.5 Add a Jest test that connects `JsonRpcGatewayClient` to the fake gateway and gets `gateway.ready`

## 4. Strings

- [x] 4.1 Write `mobile/scripts/export-strings.mjs` (loads `en.ts` with `tsx`, writes the listed key prefixes to `mobile/src/i18n/en.generated.json`, turns function strings into `{name}` templates)
- [x] 4.2 Write the `t()` helper with placeholder filling, and a test for it
- [x] 4.3 Generate and commit the first `en.generated.json`

## 5. Look

- [x] 5.1 Add React Native Paper with a Material 3 theme built from the `nous` light and dark palettes in `@hermes/shared/theme-presets`
- [x] 5.2 Define the compact spacing and type scale (4 dp step, 14 sp body, 56 dp rows)
- [x] 5.3 Follow the phone's light or dark setting, including changes while the app is open

## 6. Saved data

- [x] 6.1 Add expo-sqlite with one database per gateway and a numbered-migration runner
- [x] 6.2 Test that migrations run in order and that a second run changes nothing

## 7. Gateway check screen

- [x] 7.1 Build the start screen: gateway URL field, Check button, result area
- [x] 7.2 Call `GET /api/status` and show the version, or the "not a Hermes gateway" or "Can't reach the gateway. Is Tailscale connected?" message with Retry
- [x] 7.3 Write the built-for-version constant from `desktop-web/UPSTREAM_VERSION` and show the version banner when they differ
- [x] 7.4 Tests for the three outcomes and the banner

## 8. Test harness

- [x] 8.1 Build the fake gateway (WebSocket server in the test process that plays back fixture frames and records client frames)
- [x] 8.2 Write `mobile/scripts/record-gateway.mjs` (signs in, opens a session, sends a message, saves frames, replaces text unless `--keep-text`)

## 9. Sync step and CI

- [x] 9.1 Add the mobile step to `desktop-web/scripts/sync-upstream.sh` (install, export strings, write the built-for version, type check, test)
- [x] 9.2 Add `.github/workflows/mobile.yml` for `mobile/**` and `apps/shared/**`

## 10. Done

- [x] 10.1 Type check and tests pass
- [x] 10.2 Emulator screenshots of the start screen in light and dark mode, with and without the version banner
- [x] 10.3 The owner installs the build on their phone and checks their gateway over Tailscale

## Notes

- Not yet done when archived: the owner runs the recorder against their gateway and checks the recordings before they are committed (was task 8.3).
