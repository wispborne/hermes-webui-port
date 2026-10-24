## 1. Data

- [x] 1.1 Add migration 2: the `sessions` table
- [x] 1.2 Write the list loader for `GET /api/profiles/sessions` (default profile, cron and archived left out, hidden rows dropped, paged)
- [x] 1.3 Save loaded rows and remove rows the gateway no longer returns in the first page
- [x] 1.4 Write the `session.active_list` reader and the status-to-marker mapping
- [x] 1.5 Build `mobile/src/store/sessions.ts`: saved rows first, then gateway rows, markers kept separately
- [x] 1.6 Tests: loader, saving and removal, marker mapping (each status), offline load

## 2. Refresh

- [x] 2.1 Reload on screen focus and on pull to refresh
- [x] 2.2 Reload on `sessions.changed`, debounced to once every 2 seconds
- [x] 2.3 Poll `session.active_list` every 10 seconds while the screen is in the foreground and connected
- [x] 2.4 Tests with the fake gateway: `sessions.changed` triggers one reload; polling stops in the background

## 3. Search

- [x] 3.1 Search the gateway with `GET /api/sessions/search`, debounced 300 ms
- [x] 3.2 Offline search over saved titles and previews, with the "only saved sessions" note
- [x] 3.3 Tests for both

## 4. Screen

- [x] 4.1 Build the Sessions screen: search bar, list, new session button, Settings link
- [x] 4.2 Build the compact row: title (or preview start), preview, relative time, marker
- [x] 4.3 Show the "Can't reach the gateway" banner when offline
- [x] 4.4 The new session button opens an empty Session screen (a placeholder until session-chat)

## 5. Done

- [x] 5.1 Type check and tests pass
- [x] 5.2 Emulator screenshots: list online with markers, offline with the banner, search results
- [ ] 5.3 The owner checks on their phone that a turn started on the laptop shows its running marker

## Notes

- Checked on the emulator against `mobile/scripts/demo-gateway.mjs`. Its `l` key starts a turn on another "device" (running marker) and `a` starts one that waits on an Approval (Needs input marker).
- While the connection retries, its status stays `offline`, so the "Can't reach the gateway" banner doesn't flicker on each attempt.
