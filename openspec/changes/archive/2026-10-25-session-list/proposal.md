## Why

The Sessions screen is the app's home. It should open instantly with the last known list, even offline. It should show which sessions are running or need the person, and stay current without pulling to refresh.

## What Changes

- The Sessions screen: a search bar, then the recent sessions with cron sessions left out, newest first.
- Each row shows the title, a preview, when it was last active, and a running or Needs input marker.
- The list is saved on the phone and shown at once on open. It's replaced with the gateway's list when that arrives.
- Live refresh: the list reloads when the gateway reports that sessions changed, and markers update while the screen is open.
- Pull to refresh.
- Search across sessions on the gateway, with a fallback to searching saved titles while offline.
- A button that starts a new session. The session-chat change opens it.

## Capabilities

### New Capabilities
- `session-list`: the Sessions screen, its rows and markers, refreshing and searching.

### Modified Capabilities
- `local-storage`: adds saving the session list.

## Impact

- Replaces the placeholder Sessions screen from `gateway-sign-in`.
- New store: `mobile/src/store/sessions.ts` (nanostores), modelled on the desktop's session list stores.
- New table: `sessions` (migration 2).
- Gateway calls: `GET /api/profiles/sessions`, `GET /api/sessions/search`, and the `session.active_list` RPC. The `sessions.changed` event.
