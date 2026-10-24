## Context

Protocol: `mobile/GATEWAY_PROTOCOL.md`, sections 6 to 8 and 10. The parts that drive this design:
- A session has a stored id (saved conversation) and a runtime id (Live session). `prompt.submit`, `session.interrupt` and all events use the runtime id.
- `session.resume {session_id: <stored id>}` attaches and returns the runtime id, `running`, `inflight` (the turn in progress), `queued` and `open_requests`. `omit_messages: true` skips the transcript.
- `session.create {}` returns both ids. The saved row appears with the first message.
- `prompt.submit` answers `streaming`, `queued`, `steered` or `redirected`. The turn's end is `message.complete`. The standard protocol has no idempotency key: an unknown parameter is refused with `4000`.
- A Live session with no client is dropped about 20 seconds after the last client leaves (sooner than the turn, which keeps running while active). Resuming the stored id gives it back.
- The shared client (`@hermes/shared/json-rpc-gateway`) replays missed events after a reconnect. It sends `session.replay_gap` when it can't.

Desktop reference for behaviour:
- `apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/message-stream.ts` (streaming)
- `.../tools.ts` (tool rows)
- `apps/desktop/src/app/session/hooks/use-prompt-actions/submit.ts` (sending)
- `apps/desktop/src/api/sessions.ts` (`getLatestSessionMessages`, `getOlderSessionMessages`)

## Goals / Non-Goals

**Goals:**
- Open any saved session instantly from saved data.
- Streamed replies as smooth as the desktop's on a mid-range phone.
- Never lose a message the person wrote, and never send one twice.

**Non-Goals:**
- Approvals and Questions (the next change).
- Editing, regenerating or branching messages. Slash commands, images, the model picker, the todo list and usage.

## Decisions

### Opening a session
1. Show the saved transcript, if any.
2. `GET /api/sessions/{id}/messages` for the latest 120 rows, as the desktop does. Replace the saved rows with them.
3. `session.resume {session_id, omit_messages: true}` to attach. Keep the runtime id. If `running`, rebuild the reply in progress from `inflight`. Hand `open_requests` to the next change's handlers.
4. "Show earlier" pages older rows with the desktop's `before` parameters.

The store keys everything by stored id. A map from runtime id to stored id routes events.

### Live session lifetime
The gateway drops an unattended Live session after about 20 seconds. So whenever the connection reopens, every session the phone has on screen is resumed again. That may produce a new runtime id, and the map is updated. A `prompt.submit` that fails because the runtime id is unknown triggers one resume and one retry.

### Streaming
Port the desktop's message-stream handler, trimmed to:
- `message.start`, `message.delta`, `message.interim` and `message.complete`
- `reasoning.delta` and `reasoning.available`
- `tool.generating`, `tool.start`, `tool.progress` and `tool.complete`
- `status.update` and `error`
- `session.title` and `session.info`

Deltas are buffered and applied at most once per animation frame, like the desktop's `flushQueuedDeltas`. The streaming bubble re-renders only itself.

Tool rows show the tool name and `summary`, collapsed. Tapping expands them to `args` and `result_text`, and to `inline_diff` as monospace text when present. Reasoning is a collapsed "Reasoning" section on the assistant bubble.

### Rendering
- The transcript is a FlashList with the newest row at the bottom. It keeps the scroll position while older rows load above.
- Markdown: a trial task renders a recorded long streamed reply (code blocks, lists, a table) with each of these, on the emulator, and checks frame times and correctness:
  - `react-native-marked`
  - `@ronradtke/react-native-markdown-display`
  - `react-native-enriched-markdown`

  The pick and the numbers are recorded in this file before the rest of the rendering work.
- Code blocks: syntax highlighting with a light highlighter, horizontally scrollable, with a copy button.

### Sending and Stop
- Online: `prompt.submit {session_id: <runtime id>, text}`. The user bubble appears at once. A `queued` answer shows the message as queued below the running turn, like the desktop.
- New session: the first send calls `session.create {}`, then `prompt.submit`. The screen's route changes from `session/new` to the stored id.
- Stop: `session.interrupt {session_id}`. The turn ends with `message.complete` and status `interrupted`.
- The `prompt.submit` call waits up to 30 minutes, as the desktop does (`PROMPT_SUBMIT_REQUEST_TIMEOUT_MS`), because its answer can be slow under load.

### The outbox
Table `outbox`: id, stored session id (or a local id for a session not yet created), text, created time, state (`waiting`, `sending`, `uncertain`).
- Offline sends go to the outbox and show in the transcript as "Waiting to send", with a Cancel action.
- On connection open, entries are processed one at a time in creation order. Each one: create the session if needed, resume, `prompt.submit`, then delete the entry when the gateway accepts it.
- An entry older than 24 hours isn't sent automatically. Its bubble asks "Send now" or "Discard".
- **No double sends.** The standard protocol has no idempotency key. If the connection drops after `prompt.submit` was sent but before its answer, the entry becomes `uncertain`. On reconnect, the app reloads the session's latest rows. If the newest user message has the same text and was created after the entry, the entry is deleted. Otherwise it's sent again.

### Catching up
The shared client replays missed events by itself. On `session.replay_gap`, or when replay is impossible (the gateway restarted), the app reloads the latest rows and resumes again.

## Risks / Trade-offs

- [Markdown re-rendering on every chunk is slow] → Frame-batched updates, only the streaming bubble re-renders, and the library is picked by measuring.
- [The `uncertain` check could drop a message the person deliberately sent twice] → Only within the reconnect window, and only for the newest user message with identical text. That's acceptable.
- [Desktop stream handler logic is large] → Port only the events listed, and keep the desktop file names in comments, so later upstream changes can be compared.
