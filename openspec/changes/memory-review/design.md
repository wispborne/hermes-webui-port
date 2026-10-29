## Context

The facts below were checked in the hermes-agent v0.22.5 source (`bf0203a794`): `tools/write_approval.py`, `hermes_cli/write_approval_commands.py`, `tools/memory_tool.py` and `tui_gateway/methods_tools.py`. The web plugin in `apps/desktop/src/plugins/memory-review/` was tried against a v0.22.5 gateway in Docker.

- The gateway keeps each pending memory as a file in `<HERMES_HOME>/pending/memory/<id>.json`. It has no REST or JSON-RPC method that lists them. The only way in is the `/memory` command, and its answer is plain text.
- `command.dispatch {name: "memory", arg, session_id}` answers `/memory` inside the gateway and returns `{type: "exec", output}`. It works without a session: with an empty `session_id` it uses the gateway's own profile. `slash.exec` would start a whole CLI process for the session, which is too heavy to poll.
- `arg` is empty (the approval setting and the list), `pending`, `approve <id>`, `approve all`, `reject <id>`, `reject all`, or `approval on|off`.
- A pending memory is made when approval is on and nobody can answer in a chat (a background review, a cron job, a session with no client), and also for every edit or removal that Hermes's background review suggests, even with approval off. With approval on and the person in a chat, Hermes asks inline as an Approval, and nothing is held.
- For a memory added during a turn, `/memory` sends only the first 120 characters. The full text is saved on approve.
- An approve takes about three seconds on the test gateway.

## Goals / Non-Goals

**Goals:**
- The web page's behaviour on the phone: the same list, labels, actions, confirmations and approval switch.
- One parser for both apps.

**Non-Goals:**
- Pending skill changes (`/skills pending`). The web page doesn't have them either.
- Notifications for new pending memories. The gateway sends no event when one is made, so finding them in the background would mean polling.
- Saving the list on the phone. It's the gateway's state, and it's fetched each time the screen opens.
- Profiles other than the gateway's own one, as elsewhere in the app.

## Decisions

### Shared parser
`mobile/tsconfig.json` and `mobile/shared-resolution.js` map `@hermes/memory-review/<name>` to `apps/desktop/src/plugins/memory-review/<name>.ts`, as they already do for the desktop themes. `parse.ts` imports nothing, so Metro and Jest can load it. Its tests stay in the web plugin, where `npx vitest run` runs them. The phone's own tests cover the store and the screen.

### Where it opens
A lightbulb button in the Sessions screen's top bar, next to Settings, with a badge showing the count when any wait. The web UI has a sidebar link and a status bar count. The phone has no sidebar, and Sessions is the home screen.

### Store
`mobile/src/store/memory-review.ts` holds the last answer: the approval setting, the list, or the unreadable reply text, plus a loading flag and an error. `reloadMemoryReview()` runs `/memory`. `runMemoryCommand(arg)` runs an action, sets the reply, and reloads. Sessions calls `reloadMemoryReview()` when it gains focus and every 60 s while it's focused and the connection is open. The Memory review screen reloads when it opens and on pull to refresh. Nothing is written to the phone's database.

### Screen
Material 3, following the Settings screen: an app bar with Back and a Refresh button, the offline banner, then a list. At the top, the approval switch as a `List.Item`, then the reply card when there is one, then a card per pending memory. Approve all and Reject all go in the app bar's menu and open a Paper dialog. A pressed button shows a spinner, and all buttons are disabled while one action runs and while the connection isn't open. After an action the list scrolls to the top so the reply shows.

### Strings
The plugin's strings live in its own `i18n.ts`, not the desktop's `en.ts`, so `npm run strings` can't export them. The phone keeps the same English in `app-strings.ts` under `memoryReview`. The wording matches the web page.

### Demo gateway
`mobile/scripts/demo-gateway.mjs` answers `command.dispatch` for `memory` with the same text format, from a short list of made-up pending memories. Approve and reject remove them and print what was done.

## Risks / Trade-offs

- If a Hermes update changes the `/memory` text, both apps fall back to showing the raw reply. The fix is in one file, `parse.ts`, and its tests use the exact upstream formats.
- The count on Sessions polls once a minute while Sessions is on screen. `command.dispatch` for `/memory` reads a few small files, so this is light.
