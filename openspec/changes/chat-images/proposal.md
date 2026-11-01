## Why

Hermes sends a file it made by writing `MEDIA:<path>` into the text of a message. On the phone that text is printed as text: a reply that should show a chart shows the path to it. The phone has no image support at all today, so a picture Hermes made while the person was away from the laptop is only useful there.

## What Changes

- A delivered image shows in place of its directive. While the phone reads the file, the frame is held open with a spinner. When the gateway has no such file, refuses it, or can't be reached, the frame becomes a chip with the file name and an alert icon.
- A deliverable that isn't an image — a report, a sound, a video, a spreadsheet — shows as a small chip with an icon for its kind and the file name.
- A directive never appears as raw text in a bubble. A directive the app can't read as a complete path yet stays text: a path still arriving mid-stream, a value with no known delivery extension, an unclosed quote, or a directive inside a code span or a fenced code block.
- Tapping an image switches between a fixed frame and full width, and tapping it again switches back.
- The bytes come from `GET /api/fs/read-data-url`, the same call the web UI uses against a remote gateway. The app keeps the last 16 reads, so a list that redraws or a Session reopened doesn't ask for the same file again. A `data:` or `http(s)` value is used as it is, with no read.
- Storage is unchanged. The Session screen's items and the transcript saved on the phone keep the message text exactly as the gateway wrote it, directives included. Reading the directives happens when a message is drawn.
- `CONTEXT.md` defines Deliverable, and `mobile/GATEWAY_PROTOCOL.md` describes the directive and the file read.
- The composer is untouched: the phone still sends text only. Sending an image from the phone is a separate change.

## Capabilities

### Modified Capabilities

- `session-chat`: drawing the deliverables a Turn sends, reading their bytes from the gateway, and keeping the directive in storage.

## Impact

- New: `mobile/src/chat/media.ts` (reads directives at render time), `mobile/src/gateway/media-api.ts` (the file read and its small cache), and their tests `mobile/src/chat/media.test.ts` and `mobile/test/chat-media.test.ts`.
- Changed: `mobile/src/components/chat/transcript-items.tsx` (the bubbles draw images and chips), `mobile/test/fake-rest.ts` (a fake `GET /api/fs/read-data-url` route), `mobile/GATEWAY_PROTOCOL.md`, `CONTEXT.md`.
- Web reference: `apps/desktop/src/lib/chat-messages/parts.ts` for which directives count and which stay text, and `apps/desktop/src/lib/media.ts` for kinds and file names. The phone follows their rules, with one simplification: an unquoted path with no known delivery extension stays text, so a half-written path doesn't flash as a chip mid-stream.
- No new UI strings. A chip shows the file name and an image carries no text, so nothing needs to go through the string export.
- No gateway change, no storage change, no migration.
