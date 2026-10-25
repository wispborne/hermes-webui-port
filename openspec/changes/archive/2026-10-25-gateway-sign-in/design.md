## Context

See `mobile/GATEWAY_PROTOCOL.md`, sections 3 to 5. Summary:
- `POST /auth/password-login {provider, username, password}` sets three cookies: `hermes_session_at` (access token, max age = its lifetime), `hermes_session_rt` (refresh token, 30 days) and `hermes_session_provider`.
- The gateway refreshes an expired access token on any request and sends new cookies with the response.
- `GET /api/auth/me` answers 200 or 401.
- A WebSocket needs a single-use ticket from `POST /api/auth/ws-ticket`, valid for 30 seconds.
- `GET /api/auth/providers` names the provider. The owner's gateway has one: `basic`, with a password.

The web UI's equivalent is `desktop-web/src/bridge/gateway.ts`.

## Goals / Non-Goals

**Goals:**
- Sign in once, stay signed in for as long as the gateway allows.
- No password or session token in JavaScript storage.
- One owner for the WebSocket that later changes plug into.

**Non-Goals:**
- OAuth sign-in. It needs a loopback listener on the phone and isn't used by the owner's gateway. If the gateway lists no password provider, the Sign in screen says OAuth isn't supported yet.
- More than one gateway, and profiles.

## Decisions

### Cookies in the system cookie store
React Native's `fetch` on Android uses the system cookie store. The gateway's cookies carry `Max-Age`, so they are written to disk and survive restarts. The app never reads them. It does save the gateway URL and the username (in expo-sqlite's settings table), so the Sign in screen can fill them in.

After a successful sign-in, the app flushes the cookie store to disk. This avoids losing the cookies if the app is killed right after signing in. It needs a small native call (`CookieManager.getInstance().flush()`), added to the local Expo module this app will also use for the foreground service.

Alternatives considered: reading `Set-Cookie` and keeping the cookies in expo-secure-store. Rejected, because the web UI relies on the browser's jar and the system store already does the same job.

### Checking the sign-in at start
On start, if a gateway URL is saved, call `GET /api/auth/me`.
- 200: go to Sessions.
- 401: go to Sign in, with the URL and the username filled in.
- No answer: go to Sessions with saved data and the "Can't reach the gateway" banner (offline-first). Check again on reconnect.

### The WebSocket owner
One module, `mobile/src/gateway/connection.ts`, owns the shared `JsonRpcGatewayClient` (or a trimmed copy of the desktop's `HermesGateway` from `apps/desktop/src/api/client.ts`, using only the standard protocol path). It:
- gets a ticket and connects
- sends `client.capabilities {server_requests: true}` after `gateway.ready`
- reports a connection state to the app (connecting, open, offline, signed out)
- reconnects with `@hermes/shared/reconnect-backoff`, getting a fresh ticket each time
- treats a 401 from the ticket call, or close code 4401 with a 401 on the retry, as "signed out"

Later changes register event and server-request handlers on it.

### Sign out
`POST /auth/logout`, then clear the gateway's cookies from the store. It works even when the gateway can't be reached: the cookies are cleared locally and the logout call is skipped. Then the app deletes that gateway's database and returns to Sign in with the URL kept.

### Settings screen
A simple list:
- Gateway (URL)
- Signed in as (from `/api/auth/me`)
- App version
- Built for Hermes (the built-for version)
- Gateway Hermes version (from `/api/status`)
- Sign out

Later changes add rows (the "Keep connected" switch).

## Risks / Trade-offs

- [The system cookie store loses the cookies on some phones] → The restart check task tests this on the owner's phone. If it fails, switch to keeping the cookies in expo-secure-store, behind the same interface.
- [The password is in memory during sign-in] → It's only held by the form and the request, and never saved.
- [A sign-in left in a half state when the app is killed] → The flush after sign-in covers it, and the start check recovers from either state.
