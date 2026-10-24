## 1. Data

- [ ] 1.1 Add migration 2: the `sessions` table
- [ ] 1.2 Write the list loader for `GET /api/profiles/sessions` (default profile, cron and archived left out, hidden rows dropped, paged)
- [ ] 1.3 Save loaded rows and remove rows the gateway no longer returns in the first page
- [ ] 1.4 Write the `session.active_list` reader and the status-to-marker mapping
- [ ] 1.5 Build `mobile/src/store/sessions.ts`: saved rows first, then gateway rows, markers kept separately
- [ ] 1.6 Tests: loader, saving and removal, marker mapping (each status), offline load

## 2. Refresh

- [ ] 2.1 Reload on screen focus and on pull to refresh
- [ ] 2.2 Reload on `sessions.changed`, debounced to once every 2 seconds
- [ ] 2.3 Poll `session.active_list` every 10 seconds while the screen is in the foreground and connected
- [ ] 2.4 Tests with the fake gateway: `sessions.changed` triggers one reload; polling stops in the background

## 3. Search

- [ ] 3.1 Search the gateway with `GET /api/sessions/search`, debounced 300 ms
- [ ] 3.2 Offline search over saved titles and previews, with the "only saved sessions" note
- [ ] 3.3 Tests for both

## 4. Screen

- [ ] 4.1 Build the Sessions screen: search bar, list, new session button, Settings link
- [ ] 4.2 Build the compact row: title (or preview start), preview, relative time, marker
- [ ] 4.3 Show the "Can't reach the gateway" banner when offline
- [ ] 4.4 The new session button opens an empty Session screen (a placeholder until session-chat)

## 5. Done

- [ ] 5.1 Type check and tests pass
- [ ] 5.2 Emulator screenshots: list online with markers, offline with the banner, search results
- [ ] 5.3 The owner checks on their phone that a turn started on the laptop shows its running marker
