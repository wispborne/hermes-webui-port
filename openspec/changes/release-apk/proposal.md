## Why

The app on the owner's phone is a development build. It loads its code from Metro on the owner's PC, so it only gets new code when the PC is running and reachable. The owner wants a standalone app that they install and update with Obtainium from the Gitea releases, without plugging the phone in.

## What Changes

- A Gitea Actions workflow builds a signed release APK whenever the version in `mobile/app.json` changes on main. It tags the commit `mobile-v<version>` and makes a Gitea release with the APK attached. It skips on GitHub, like the web UI's tag workflow.
- The release notes are the subjects of the commits that changed `mobile/` since the last `mobile-v` tag.
- Android's version number (`versionCode`) is worked out from the version: 1.2.3 becomes 10203.
- The release is signed with one release key, kept as Gitea Actions secrets, with a backup in the owner's password manager. A wizard script walks the owner through making the key and adding the secrets.
- The development build gets its own app ID, `com.wispborne.hermes.dev`, and the name "Hermes Dev". It installs next to the release app instead of replacing it.
- Release builds allow `http://` gateway addresses, as development builds do today.
- The README explains how to add the app to Obtainium.
- The Mobile workflow also checks that `themes.generated.json` is up to date.

## Capabilities

### New Capabilities
- `app-release`: how the app is built, numbered, signed, published and installed.

### Modified Capabilities

None.

## Impact

- New: `.github/workflows/mobile-release.yml`, `mobile/app.config.ts` (replaces `app.json`'s fixed values where the build variant or version decides them), `mobile/plugins/with-release-signing.js`, `mobile/scripts/release-key-wizard.sh`.
- Changed: `mobile/app.json` stays the place the version is bumped. `mobile/package.json` (`android` script sets the development variant), `mobile/README.md`, `.github/workflows/mobile.yml`.
- New dependency: `expo-build-properties`.
- One-time cost: the app now on the owner's phone has the release app's ID but a debug signature. Installing the first release means uninstalling it first, which deletes what it saved on the phone. Sign-in, the session list and transcripts come back from the gateway. The appearance choices and any unsent Outbox messages don't.
- No change to the web UI, `apps/`, or the `ui-*` tags.
