## Context

The desktop builds its sidebar from:
- REST lists in `apps/desktop/src/api/sessions.ts`. Recents leave out cron sessions with `exclude_sources=cron`.
- Live status from the gateway.

Facts from the gateway source (Hermes 0.22.4):
- `GET /api/profiles/sessions?...&exclude_sources=cron&archived=exclude&order=recent` returns saved sessions. Rows have `id`, `title`, `preview`, `started_at`, `last_active`, `message_count`, `source`, `is_active`, `pinned` and `hidden`.
- `session.active_list` (WebSocket) returns every live session on the gateway, with a `status`: `idle`, `starting`, `waiting`, `working`, `streaming` or `resuming`. `waiting` means an Approval or Question is pending (`tui_gateway/session_registry.py`, `_session_live_status`). `session_key` is the saved session's id.
- `sessions.changed` is broadcast when the gateway's session database changes.
- `GET /api/sessions/search?q=` searches saved sessions.

## Goals / Non-Goals

**Goals:**
- Instant open from saved data.
- Markers for sessions running anywhere on the gateway, including ones open on the laptop, without the phone attaching to them.
- No manual refresh needed while the screen is open.

**Non-Goals:**
- Pinned sessions, project grouping, archived sessions, and other profiles.
- Deleting or renaming sessions from the list.

## Decisions

### List source
Use `GET /api/profiles/sessions` with `profile=default`, `exclude_sources=cron`, `archived=exclude`, `order=recent`, and `limit=40`. Rows marked `hidden` are left out, as on the desktop. More rows load on scroll with `offset`.
Alternative considered: the WebSocket `session.list`. Rejected, because its rows lack `last_active` and the source filter.

### Markers
Markers come from `session.active_list`, matched to rows by `session_key`:
- `working`, `streaming`, `starting` or `resuming`: running marker.
- `waiting`: Needs input marker.
- `idle`, or not live: no marker.

Sessions open on the phone also update their marker straight from their own events (from session-chat and approvals-and-questions), so the phone's own sessions change at once.

### Refresh
- On screen focus: reload the list and `session.active_list`.
- On `sessions.changed`: reload the list, debounced to once every 2 seconds.
- While the screen is on screen and connected: poll `session.active_list` every 10 seconds. The gateway sends no event when a laptop session starts a turn, so polling is the only way to see it.
- Pull to refresh: reload both now.

### Saved list
Table `sessions` holds the gateway's row fields, plus `saved_at`. Each successful reload replaces the rows for the pages loaded. Rows the gateway no longer returns in the first page are deleted, so deleted sessions disappear. Markers aren't saved; they show only while connected.

### Search
While connected: `GET /api/sessions/search?q=`, debounced 300 ms. Offline: filter saved rows by title and preview, with a note that only saved sessions are searched.

### Time display
Relative times ("5m", "2h", "Yesterday", then a date), using the desktop's format helpers from `@hermes/shared/format` where they fit.

## Risks / Trade-offs

- [Polling `session.active_list` costs battery] → It only runs while Sessions is on screen and the app is in the foreground.
- [Another profile's sessions] → Out of scope. Only `default` is listed.
