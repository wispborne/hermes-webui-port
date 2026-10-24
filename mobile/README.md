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
