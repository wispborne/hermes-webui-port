## Context

The repo builds the Hermes desktop app's React code for a browser. Upstream code lives in `apps/desktop` and `apps/shared`. `desktop-web/scripts/sync-upstream.sh` moves it to a new Hermes version, rewrites the root `package.json`, and copies upstream's lockfile verbatim.

`apps/shared` is plain TypeScript with no runtime dependencies. It contains the gateway client (`json-rpc-gateway.ts`, `json-rpc-channel.ts`), the generated contract (`gateway-contract.generated.ts`, `gateway-contract.openrpc.json`), the theme palettes (`theme-presets.ts`) and smaller helpers. Its files import each other with a `.js` suffix (for example `./gateway-events.js`) even though the files end in `.ts`.

The desktop's English strings live in `apps/desktop/src/i18n/en*.ts`. `en.ts` imports `@/app/settings/constants`, which imports desktop icon components. So `en.ts` can't be bundled into the app directly.

The owner's gateway is `https://hermes-dashboard.wispborne.com`, reached over Tailscale. It runs Hermes 0.22.4 with password sign-in only.

## Goals / Non-Goals

**Goals:**
- An Android app that installs, opens, and checks a gateway.
- `@hermes/shared` importable from the app, and type-checked as part of it.
- The desktop's wording and colours available to every later change.
- A saved-data layer every later change uses the same way.
- Breakage from an upstream sync shows up in the sync, not on the phone.

**Non-Goals:**
- Sign-in, sessions, chat or anything else that needs a signed-in gateway. Those are later changes.
- iOS. The code should stay portable, but no iOS build or testing.
- A published APK.

## Decisions

### Expo development build, built locally
`npx expo run:android` builds a development client on this machine. It allows any native module, including the local module the background-connection change needs. Expo Go was rejected because it limits native modules. EAS cloud builds were rejected because they need an Expo account for no gain here.

Use the newest stable Expo SDK when this change starts. That's SDK 56 (React Native 0.85, React 19.2) as of October 2026, or a later one if it's out. React 19.2 matches the desktop's React version.

### Importing `apps/shared`
- TypeScript: a `paths` entry maps `@hermes/shared` and `@hermes/shared/*` to `../apps/shared/src`. The app's `tsc` type-checks those files too.
- Metro: `watchFolders` includes `../apps/shared`. A custom `resolver.resolveRequest` maps `@hermes/shared` to the source folder. It also retries a relative `.js` import as `.ts` when the `.js` file doesn't exist, because Metro doesn't do that on its own.
- Import through the package's subpath exports (`@hermes/shared/json-rpc-channel` and so on) or the index. `index.ts` re-exports modules that mention `window` inside functions. That's harmless as long as those functions aren't called. A test imports the index under the React Native Jest preset to prove it.
- Polyfill only what's missing. The gateway client uses `WebSocket`, timers and one `new URL()` call. Add `react-native-url-polyfill` at app start. Add others only when a test or a run shows they're needed.

Alternative considered: copying `apps/shared` into `mobile/` on each sync. Rejected, because the copy would drift and the type check wouldn't see upstream's changes.

### Strings
`mobile/scripts/export-strings.mjs` runs in Node from the repo root, where the web UI's `node_modules` exist. It loads `apps/desktop/src/i18n/en.ts` with a TypeScript loader (`tsx`), so desktop-only imports resolve as they do for the web build. It then writes the sections the app uses to `mobile/src/i18n/en.generated.json`. Function-valued strings, for example `approvalTitleNamed: session => ...`, are written as templates with named placeholders (`"Approval needed — {session}"`). The script has a list of exported key prefixes, so new sections are added on purpose. The generated file is committed, so each sync's string changes show up in the diff.

A small `t()` helper in the app reads the JSON and fills in placeholders. Keys match the desktop's (`notifications.native.approvalTitle`).

Alternatives considered: replacing the problem import with a stand-in file at bundle time. Rejected, because it breaks silently when upstream changes what `en.ts` imports.

### Saved data
expo-sqlite, with one database per signed-in gateway. Later changes add tables through numbered migrations in `mobile/src/storage/migrations/`. The rules in the `local-storage` spec apply to every table.
Alternatives considered: MMKV and AsyncStorage. Rejected, because transcripts need ordered rows, replacing and pruning.

### Look
React Native Paper provides the Material 3 components and theming. Expo UI's Jetpack Compose components (production-ready since SDK 56) were considered. Paper was picked because the transcript and lists need ordinary React Native views, and Paper themes them consistently. Expo UI can still be used for single controls later.

"Compact" means:
- Paper's dense component variants where they exist.
- A 4 dp spacing step, with 8 dp between list items and 12 dp screen padding.
- 14 sp body text.
- List rows about 56 dp tall.
- No large hero headers.

Colours come from the `nous` palette in `@hermes/shared/theme-presets`, which is the desktop's default theme. The app maps its slots to a Material 3 colour scheme:

| Hermes slot | Material 3 role |
| --- | --- |
| `primary` | primary |
| `background` | surface |
| `card` | surface container |
| `muted` | surface variant |
| `border` | outline |
| `destructive` | error |
| `userBubble` | the user-message bubble |

Hermes has both a light and a dark palette, and the phone's setting picks which one is used. So a desktop colour change reaches the app after a sync.

### Gateway check
A start screen with a gateway URL field. On submit, the app calls `GET /api/status` (public) and shows the version, or the reason it failed. The app knows its own built-for version from a constant that the sync step writes from `desktop-web/UPSTREAM_VERSION`. The version banner and the "Can't reach the gateway" message are shared components that later changes reuse.

### Testing
- Jest with the `jest-expo` preset.
- The fake gateway: a small WebSocket server in the test process. It plays back recorded frames from `mobile/test/fixtures/` and records what the client sent.
- The recorder: `mobile/scripts/record-gateway.mjs`. The owner runs it with their gateway URL and login. It signs in, opens a session, sends a message, and saves every frame in both directions. It replaces message text with placeholders unless `--keep-text` is given. The owner checks the recordings before committing them.
- Visual checks: Android emulator screenshots through `adb exec-out screencap`.

### Sync step and CI
`sync-upstream.sh` gets a final step: `npm --prefix mobile ci`, the strings export, `npm --prefix mobile run typecheck` and `npm --prefix mobile test`. A failure stops the sync before its "Done" message.
A new workflow, `.github/workflows/mobile.yml`, runs the same checks on pushes and pull requests that touch `mobile/**` or `apps/shared/**`.

## Risks / Trade-offs

- [An upstream sync starts using a browser feature the phone lacks] → The sync step and CI run the app's tests under the React Native Jest preset. Add the polyfill or a fix in the same sync.
- [Metro can't resolve something in `apps/shared` after an upstream change] → The custom resolver is small and tested. A failing bundle fails the sync step.
- [`tsx` can't load `en.ts` after an upstream change] → The export script fails loudly. The last generated JSON still works until it's fixed.
- [Two React Native "Hermes" meanings] → React Native's JavaScript engine is also called Hermes. Code and docs call it "the JS engine". "Hermes" always means the agent.

## Open Questions

- The exact Expo SDK version. Pick the newest stable one when the work starts.
