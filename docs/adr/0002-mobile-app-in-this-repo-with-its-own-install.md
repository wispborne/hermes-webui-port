# The mobile app lives in this repo, with its own install

The mobile app lives in `mobile/` in the web UI's repo, because both import `apps/shared` and both move to a new Hermes version in the same upstream sync. It has its own `package.json` and lockfile and is not part of the root npm workspace. The upstream sync rewrites the root `package.json` and copies upstream's lockfile verbatim (`desktop-web/scripts/upstream.mjs`), so anything added there would be lost on the next sync. The app reaches `apps/shared` through its bundler and TypeScript settings instead.

## Consequences

- The app's dependencies (React Native, Expo) never mix with upstream's lockfile.
- `mobile/`, `openspec/`, `docs/`, `CONTEXT.md` and `.github/` are on the release workflow's ignore list, so changes there don't make a new `ui-*` web release.
