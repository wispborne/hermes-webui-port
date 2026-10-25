# Hermes mobile app

An Android app for chatting with your Hermes agent through a Hermes gateway (the Hermes dashboard).
It's built with React Native and Expo. It uses the desktop app's gateway client from `apps/shared` and the desktop app's English strings.

The app is planned in [`openspec/`](../openspec/changes/). The words it uses are defined in [`CONTEXT.md`](../CONTEXT.md). The gateway's API, as the app uses it, is in [`GATEWAY_PROTOCOL.md`](GATEWAY_PROTOCOL.md).

## Requirements

- Node 24.
- The Android SDK, with `ANDROID_HOME` set to it.
- JDK 17 for the Android build. Newer JDKs don't work with React Native's Gradle build.
- An Android phone with USB debugging on, or an emulator.

## Build and run

The app has its own packages, separate from the web UI's:

```bash
npm --prefix mobile install
```

Build a development build and install it on the phone or emulator:

```bash
cd mobile
npm run android
```

This builds on your machine, without the Expo cloud. It also starts Metro, which serves the JavaScript to the app. After the first build, `npm start` is enough while you only change JavaScript.

The development build is called "Hermes Dev" and has the app ID `com.wispborne.hermes.dev`, so it installs next to the release app. `npm run android` and `npm start` set `APP_VARIANT=development` for it. `app.config.ts` reads that.

## Releases

A push to main that changes the version in `app.json` makes a release. The `Mobile release` workflow on Gitea checks the app, builds an APK signed with the release key, and publishes the release "Hermes mobile <version>", tagged `mobile-v<version>`, with `hermes-<version>.apk` attached. The release notes are the commits that changed `mobile/` since the last release.

The version has three parts, each from 0 to 99. Android's version number is worked out from it: 1.2.3 becomes 10203.

The release key is made once with `bash scripts/release-key-wizard.sh`. It makes the key, walks you through adding it as four Gitea Actions secrets, and has you back it up in your password manager. Every release must be signed with that key. If it's lost, the installed app can't be updated and has to be uninstalled, which deletes what it saved on the phone.

### Install with Obtainium

1. In Obtainium, add an app with the source URL `https://git.wispborne.com/david/hermes-ui`.
2. Set "Filter release titles by regular expression" to `^Hermes mobile`. The same repository has the web UI's `ui-*` releases, and this skips them.
3. Set "Filter APKs by regular expression" to `hermes-.*\.apk`.
4. Install. Obtainium then offers each new release as an update.

The APK is built for 64-bit ARM phones (`arm64-v8a`), not for emulators.

A development build made before the development build had its own app ID used `com.wispborne.hermes`. Uninstall it before installing the first release. Sign-in, sessions and transcripts come back from the gateway. Appearance choices and unsent messages in the Outbox don't.

## Checks

```bash
npm run typecheck
npm test
```

The type check covers `apps/shared` too.

## Generated files

- `src/i18n/en.generated.json` holds the desktop strings the app uses. `npm run strings` exports it from `apps/desktop/src/i18n/en.ts`. It needs the web UI's packages installed at the repo root (`npm ci` there). To use a new section of strings, add its key prefix to `EXPORTED` in `scripts/export-strings.mjs`.
- `src/gateway/built-for-version.ts` holds the Hermes version the app is built for. `npm run built-for-version` writes it from `desktop-web/UPSTREAM_VERSION`.

`npm run sync-upstream` at the repo root runs both, then the type check and tests.

## Trying it without a real gateway

`scripts/demo-gateway.mjs` is a pretend gateway with made-up sessions and scripted replies:

```bash
cd mobile
node scripts/demo-gateway.mjs
```

On the emulator, sign in to `http://10.0.2.2:8787` with any username and the password `demo`. The script's header lists the messages that trigger an Approval, a Question, a failed turn or a slow reply, and the keys that drop the connection or restart the gateway.

## Recorded gateway traffic

Tests play back recorded WebSocket traffic with a fake gateway (`test/fake-gateway.ts`). To record new traffic from your own gateway:

```bash
cd mobile
node scripts/record-gateway.mjs --url https://hermes.example.com --username you
```

It signs in, starts a session, sends one message and saves every frame to `test/fixtures/recorded-chat.json`. Message text is replaced with `x` unless you pass `--keep-text`. Check the file before committing it.
