## 1. REST and sign-in

- [x] 1.1 Write the REST helper (base URL, JSON, error mapping to the gateway's status codes)
- [x] 1.2 Read `GET /api/auth/providers` and pick the password provider; show the "not supported yet" message when there is none
- [x] 1.3 Call `POST /auth/password-login` and map 401, 404, 429 and 503 to messages
- [x] 1.4 Save the gateway URL and the username in the settings table; never the password
- [x] 1.5 Create the local Expo module `mobile/modules/hermes-background` (Kotlin) with `flushCookies()`, and call it after sign-in

## 2. Start check

- [x] 2.1 On start, call `GET /api/auth/me` and route to Sessions, Sign in, or Sessions offline
- [x] 2.2 Tests for the three routes with a fake REST server

## 3. WebSocket owner

- [x] 3.1 Build `mobile/src/gateway/connection.ts` around the shared gateway client, using only the standard protocol path
- [x] 3.2 Get a fresh `ws-ticket` for every connection and every reconnect
- [x] 3.3 Send `client.capabilities {server_requests: true}` after `gateway.ready`
- [x] 3.4 Reconnect with `@hermes/shared/reconnect-backoff`; report connecting, open, offline and signed out
- [x] 3.5 Tests against the fake gateway: connect, capabilities sent first, reconnect after a drop, signed-out on 401

## 4. Screens

- [x] 4.1 Build Sign in (gateway URL with the foundation's check, username, password, Sign in button)
- [x] 4.2 Build Settings (gateway, signed in as, versions, Sign out)
- [x] 4.3 Add a placeholder Sessions screen with a Settings link, for the session-list change to fill in

## 5. Sign out

- [x] 5.1 Call `POST /auth/logout` when reachable, clear the gateway's cookies, delete the gateway's database
- [x] 5.2 Tests for sign-out online and offline, and that saved data is gone afterwards

## 6. Done

- [x] 6.1 Type check and tests pass
- [x] 6.2 Emulator screenshots of Sign in (empty, error) and Settings
- [x] 6.3 The owner signs in on their phone, force-stops the app, restarts the phone, and confirms the app is still signed in
- [x] 6.4 The owner signs out and confirms the app returns to Sign in with the URL kept

## Notes

- Checked on the emulator against `mobile/scripts/demo-gateway.mjs`: sign-in, the error message, the WebSocket (ticket, then `client.capabilities`), staying signed in after a force-stop, returning to Sign in when the gateway forgets the session, and sign-out.
- The `TextDecoder` risk from mobile-foundation is closed. The gateway client loads and connects on the emulator with no polyfill: React Native 0.86's JS engine has `TextDecoder`.
