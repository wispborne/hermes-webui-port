## Why

Everything useful in the app needs a signed-in gateway. The gateway uses password sign-in with session cookies that last 30 days and refresh themselves. The app should sign in once, stay signed in across restarts like the web UI does, and never hold the password.

## What Changes

- A Sign in screen: gateway URL, username and password. It is the first screen when the app has no working sign-in.
- Password sign-in through `POST /auth/password-login`. Cookies stay in Android's system cookie store.
- A check at app start (`GET /api/auth/me`) that goes straight past sign-in when the cookies still work.
- A WebSocket connection to the gateway through the shared gateway client, with a fresh `ws-ticket` for every connection, and `client.capabilities` sent after `gateway.ready`.
- A Settings screen: the gateway URL, the signed-in user, the app's and the gateway's versions, and Sign out.
- Sign out clears the cookies and wipes all saved data for that gateway.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `gateway-connection`: adds sign-in, staying signed in, the WebSocket connection, the Settings screen and sign-out.
- `local-storage`: adds wiping saved data on sign-out.

## Impact

- New screens: `sign-in`, `settings`. The start screen from `mobile-foundation` becomes part of Sign in.
- New code: `mobile/src/gateway/` (REST calls, sign-in, WebSocket connection owner).
- Relies on Android's cookie store keeping the gateway's cookies, which carry `Max-Age`, across restarts. A task checks this on a real device.
