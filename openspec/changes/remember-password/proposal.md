## Why

The owner has to type the gateway password again too often. The gateway's sessions are meant to last 30 days and renew themselves, but a gateway with no fixed `dashboard.basic_auth.secret` makes a new signing key each time it starts, so every Hermes restart or update signs every device out. The owner asked the phone to keep the password safely so they don't have to retype it.

## What Changes

- Sign in has a "Remember password on this phone" switch, on by default. The phone remembers whether the person turned it off.
- With it on, the password is kept in expo-secure-store: encrypted with a key in the Android Keystore, for one gateway URL and username, and kept out of Android's backups by the library's config plugin. It is never put in the app settings.
- When the gateway refuses the session, at start or while the app runs, the app signs in again by itself with the remembered password, and the person stays where they were. It tries at most once a minute, so a gateway that takes the password but keeps refusing the session ends at Sign in, not in a loop.
- When the gateway turns the remembered password down, the phone forgets it and Sign in says so. When the gateway is only too busy or can't be reached, the password is kept.
- Signing out forgets the password. Turning the switch off and signing in forgets it too.
- `scripts/demo-gateway.mjs` has a key `e` that ends every sign-in, as a gateway restart without a fixed secret does.
- The real fix for the frequent sign-outs is on the gateway: set `dashboard.basic_auth.secret`. That's a server change, recorded in the homelab notes, not in this repo.

## Capabilities

### Modified Capabilities

- `gateway-connection`: Sign in may remember the password, and the app signs in again by itself when the gateway refuses the session.

## Impact

- New: `mobile/src/storage/saved-password.ts`, `mobile/test/memory-password-store.ts`.
- Changed: `mobile/src/store/gateway.ts` (save, forget, sign in again), `mobile/src/screens/sign-in-screen.tsx` (the switch and the notice), `mobile/src/storage/app-settings.ts` (`rememberPassword`), `mobile/src/i18n/app-strings.ts` (two strings), `mobile/app.json` (the expo-secure-store plugin), `mobile/package.json` (expo-secure-store), `mobile/scripts/demo-gateway.mjs` (key `e`), and the tests.
- A new native module: installing it needs a new build, not only a JavaScript update.
