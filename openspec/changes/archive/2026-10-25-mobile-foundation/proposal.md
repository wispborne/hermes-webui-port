## Why

The Hermes web UI works well on a laptop but not on a phone, and Matrix is a poor substitute. A dedicated Android app needs a base to build on first: a project that imports the shared gateway client, uses the desktop's wording and colours, saves data on the phone, and is checked automatically after every upstream sync. This change builds that base. It ends with an app that installs and can talk to a gateway.

## What Changes

- A new Expo app in `mobile/`, built as a local development build for Android. It has its own `package.json` and lockfile, outside the root npm workspace (see `docs/adr/0002-mobile-app-in-this-repo-with-its-own-install.md`).
- The app imports `apps/shared` as `@hermes/shared`, the same name the desktop uses.
- A script exports the desktop's English strings to a JSON file in `mobile/`, keyed the same way as the desktop.
- A local SQLite database for saved data, with the rules that every later change follows.
- The app's look: Material 3, compact, with colours from the desktop's default theme.
- A first screen that takes a gateway URL, checks it with `GET /api/status`, and shows the gateway's Hermes version. A banner warns when that version differs from the one the app was built for.
- Testing: Jest, a fake gateway that plays back recorded WebSocket traffic, and a recorder script.
- The upstream sync script also type-checks the app, runs its tests and regenerates its strings.
- A mobile CI workflow. Web release tags ignore `mobile/**`, `openspec/**`, `docs/**`, `CONTEXT.md` and `.github/**`.

## Capabilities

### New Capabilities
- `app-appearance`: how the app looks. Material 3, compact layouts, Hermes colours, light and dark modes.
- `local-storage`: what the app saves on the phone and the rules for keeping it in step with the gateway.
- `gateway-connection`: reaching a gateway. In this change: checking a gateway URL and reporting its Hermes version.

### Modified Capabilities

None. There are no specs yet.

## Impact

- New: `mobile/` (the app), `mobile/scripts/` (string export, traffic recorder).
- Changed: `desktop-web/scripts/sync-upstream.sh` (runs the mobile checks), `.github/workflows/` (new mobile workflow; wider ignore list on `tag-release.yml`).
- No change to the web UI's build or to `apps/`.
