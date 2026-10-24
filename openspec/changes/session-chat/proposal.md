## Why

This is what the app is for: reading a session and talking to Hermes from the phone. It has to feel as good as the desktop, with streamed replies, readable tool activity and a Stop button. It also has to work offline-first: saved transcripts open at once, and messages written offline wait in the outbox.

## What Changes

- The Session screen: the transcript and a message box. The message box's Send button becomes **Stop** while a turn runs.
- Opening a saved session shows its saved transcript at once, then attaches to the gateway and updates.
- Starting a new session from the Sessions screen.
- Sending messages, with replies streamed as they're written.
- Transcript rendering:
  - Markdown with highlighted code blocks
  - tool rows, collapsed to a name and summary, that expand to arguments and result
  - collapsed reasoning
  - diffs as monospace text
- "Show earlier" loads older messages of long sessions.
- The outbox: messages written while offline wait, marked "Waiting to send". They're sent in order on reconnect and can be cancelled. Messages older than 24 hours ask before sending.
- Catching up after a reconnect, through the shared gateway client's replay. The session reloads when replay can't cover the gap.

## Capabilities

### New Capabilities
- `session-chat`: the Session screen, transcript, sending, streaming, Stop, the outbox, and catching up after a reconnect.

### Modified Capabilities
- `local-storage`: adds saved transcripts (50 most recently opened sessions) and the saved outbox.

## Impact

- New screen: `session/[id]`. The new session button from session-list opens `session/new`.
- New stores, ported and trimmed from the desktop: the session state and message stream (`apps/desktop/src/app/session/hooks/use-message-stream/`, `apps/desktop/src/store/session*.ts`).
- New tables: `messages`, `outbox` (migration 3).
- Gateway calls: `GET /api/sessions/{id}/messages`, and the `session.resume`, `session.create`, `prompt.submit`, `session.interrupt` and `session.events.since` RPCs (the last through the shared client). The message, reasoning and tool events.
- New dependencies: a Markdown renderer (picked in a trial task), a code highlighter, and FlashList.
