## 1. Keeping the password

- [x] 1.1 Add expo-secure-store and its config plugin (keeps the value out of Android's backups)
- [x] 1.2 `mobile/src/storage/saved-password.ts`: save, load (only for the same URL and username) and forget, with a store tests can swap
- [x] 1.3 `rememberPassword` in the app settings, on unless turned off

## 2. Signing in again

- [x] 2.1 `signIn` saves the password when Remember is on and forgets it when it's off; `signOut` forgets it
- [x] 2.2 The start check and a session ended while the app runs sign in again with the remembered password, at most once a minute
- [x] 2.3 A remembered password the gateway turns down is forgotten, and Sign in says so; too busy or unreachable keeps it

## 3. Sign in

- [x] 3.1 "Remember password on this phone" switch, and the notice when the saved password didn't work

## 4. Checks

- [x] 4.1 Store tests in `mobile/test/sign-in.test.ts` and screen tests in `mobile/src/screens/sign-in-screen.test.tsx`
- [x] 4.2 Emulator, against `scripts/demo-gateway.mjs` and its new key `e`: the app signs in again by itself while running and when opened after the gateway ended the sign-in; after Sign out it shows Sign in and doesn't sign in by itself
- [ ] 4.3 The owner sets `dashboard.basic_auth.secret` on the gateway, so restarts stop ending sessions at all
