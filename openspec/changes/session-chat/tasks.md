## 1. Markdown trial

- [x] 1.1 Record a long streamed reply with code blocks, lists and a table (from the recorder fixtures)
- [x] 1.2 Render it with `react-native-marked`, `@ronradtke/react-native-markdown-display` and `react-native-enriched-markdown` on the emulator; measure frame times while streaming and check correctness
- [x] 1.3 Record the pick and the numbers in this change's design.md

## 2. Data

- [x] 2.1 Add migration 3: `messages` (by stored session id and row id, with last-opened time per session) and `outbox`
- [x] 2.2 Load the latest 120 rows with `GET /api/sessions/{id}/messages`, and older pages with the desktop's paging parameters
- [x] 2.3 Replace saved rows with loaded rows; keep the 50 most recently opened sessions' transcripts
- [x] 2.4 Tests: replacing, paging, the 50-session limit

## 3. Session store

- [x] 3.1 Port and trim the desktop's session state store: messages, streaming bubble, running state, queued message
- [x] 3.2 The runtime id to stored id map, and routing events by it
- [x] 3.3 Resume (`omit_messages: true`) on open and on every reconnect; rebuild the reply in progress from `inflight`
- [x] 3.4 Pass `open_requests` to a hook the approvals-and-questions change will fill

## 4. Streaming

- [x] 4.1 Port the message-stream handler for the events listed in design.md
- [x] 4.2 Batch deltas to once per animation frame
- [x] 4.3 Tool rows from `tool.*` events; `status.update` and `error`; `session.title` updates the header
- [x] 4.4 Tests with recorded traffic: a full turn, a turn with tools, an interim block, an error turn

## 5. Sending and Stop

- [x] 5.1 `prompt.submit` with the 30-minute wait; show the user bubble at once; show `queued` answers as queued
- [x] 5.2 New session: `session.create`, then `prompt.submit`, then switch the route to the stored id
- [x] 5.3 Stop with `session.interrupt`
- [x] 5.4 Retry once through a fresh resume when the runtime id is unknown
- [x] 5.5 Tests for each

## 6. Outbox

- [x] 6.1 Put sends in the outbox while offline; show "Waiting to send" with Cancel
- [x] 6.2 Process the outbox in order on connection open, creating sessions as needed
- [x] 6.3 The 24-hour check with "Send now" and "Discard"
- [x] 6.4 The `uncertain` state and the reload-and-compare check
- [x] 6.5 Tests: order, new session offline, cancel, 24 hours, drop during send produces exactly one message

## 7. Catching up

- [x] 7.1 On `session.replay_gap` or a new replay epoch, reload the latest rows and resume
- [x] 7.2 Tests: replay fills a gap; a gateway restart reloads

## 8. Screen

- [x] 8.1 Build the Session screen: header with title, FlashList transcript, message box with Send and Stop
- [x] 8.2 User and assistant bubbles, Markdown, highlighted code blocks with copy, collapsed reasoning
- [x] 8.3 Compact tool rows that expand; diffs in monospace
- [x] 8.4 "Show earlier" that keeps the scroll position
- [x] 8.5 The "Can't reach the gateway" banner, and the "not saved on this phone" message for unopened sessions offline

## 9. Done

- [x] 9.1 Type check and tests pass
- [x] 9.2 Emulator screenshots: streaming reply, tool rows open and closed, outbox messages, Stop
- [ ] 9.3 The owner uses it on their phone for real work, including turning Tailscale off and on mid-reply and sending while offline

## Notes

- 1.1: no recording from a real gateway exists yet, because the recorder needs the owner's gateway. `mobile/test/fixtures/long-reply.json` was written by hand instead: a 5,250-character reply with headings, lists, a table, a block quote and three code blocks, split into stream pieces of 3 to 14 characters.
- The collapsed reasoning section uses the desktop's words, "Thinking" while it streams and "Thought" after, instead of "Reasoning".
- Every message goes through the outbox, online or not, so a message is never lost if the app closes mid-send. "Waiting to send" shows only while the gateway can't be reached, or after a send failed with the gateway reachable (for example, when the session was deleted elsewhere).
- Checked on the emulator against `mobile/scripts/demo-gateway.mjs`: opening a session, a streamed reply with reasoning, a tool row and code blocks, Stop, and two messages written offline that were sent in order after the gateway came back.
