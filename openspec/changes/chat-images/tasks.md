## 1. Reading the directives

- [x] 1.1 `mobile/src/chat/media.ts`: `parseMediaSegments(text)` into ordered text and media segments, following the web UI's rules in `apps/desktop/src/lib/chat-messages/parts.ts`: standalone-line and inline directives, paths quoted with backticks, double quotes or apostrophes, unquoted paths with spaces anchored by a known delivery extension, sentence punctuation left in the prose, code spans and fenced blocks left alone, and an incomplete directive kept as text
- [x] 1.2 `mediaKind(path)` for image, video, audio and file, `mediaName(path)` for the chip, and `isInlineMediaSrc(path)` for a `data:` or `http(s)` value
- [x] 1.3 Unit tests in `mobile/src/chat/media.test.ts` for each rule, including a path cut short mid-stream and a directive inside a code block

## 2. Reading the bytes

- [x] 2.1 `mobile/src/gateway/media-api.ts`: `loadMediaDataUrl(rest, path)` over `GET /api/fs/read-data-url` on the app's existing `GatewayRest`, a `data:` or `http(s)` value returned as it is, and a small cache keyed by path (16 entries) that drops a failed read so the next draw can succeed
- [x] 2.2 A fake `GET /api/fs/read-data-url` route in `mobile/test/fake-rest.ts`, answering from a map of paths with a real 1x1 PNG and 404 for anything else
- [x] 2.3 Harness tests in `mobile/test/chat-media.test.ts`: a saved transcript row and a streamed `message.complete` keep the directive verbatim in the store and in the saved transcript, and the read is asked once, shared, retried after a failure, and dropped when a bigger transcript pushes it out

## 3. The bubbles

- [x] 3.1 `mobile/src/components/chat/transcript-items.tsx`: the assistant and the person's bubble draw their segments in order, text through the existing Markdown view and media through the new `Media` view; the memoized item view still only redraws the item that changed
- [x] 3.2 `MediaImage`: spinner frame while the read runs, the picture when it arrives, a chip with an alert icon when the read fails, and a tap switching between the frame and full width
- [x] 3.3 `MediaChip`: an icon for the kind and the file name
- [x] 3.4 Bubble tests in `mobile/src/components/chat/transcript-items.test.tsx`: the image renders with the fetched data URI, a missing file and an unreachable gateway render the chip, a non-image path renders the chip, a code block and a half-arrived path stay text, and a plain reply draws exactly as before
- [x] 3.5 SVG is classed as a file, not an image: Android's and iOS's `Image` can't decode SVG, data or file, so a chip beats a blank frame. The web UI still renders SVGs.

## 4. Terms and protocol notes

- [x] 4.1 Define Deliverable in `CONTEXT.md`
- [x] 4.2 Describe the `MEDIA:` directive and `GET /api/fs/read-data-url` in `mobile/GATEWAY_PROTOCOL.md`, with the route added to the REST table
- [x] 4.3 No new UI strings: a chip shows the file name and an image carries no text, so nothing needs exporting from the web UI's strings

## 5. Review fixes

- [x] 5.1 A failed image is read again when the connection to the gateway comes back
- [x] 5.2 A picture the phone can't draw shows the alert chip; an `http(s)` picture first tries `GET /api/media/proxy`
- [x] 5.3 Media views are keyed by position and path, so a new path never keeps the old picture or failure
- [x] 5.4 A directive in the middle of a line leaves the file name in the line (inline code in Markdown), and the file is drawn after the paragraph, so sentences and tables stay whole
- [x] 5.5 While a reply streams, an unquoted path at the very end of the text stays text (`report.doc` before `report.docx`)
- [x] 5.6 A `data:` value is named by its type (`image.png`), not its base64 text
- [x] 5.7 The cache is emptied for a different gateway, and holds about 24 MB of data URL text at most

## 6. Done

- [x] 6.1 Type check and tests pass in `mobile/`. Along the way two pre-existing test flakes were fixed: the Memory review menu test now uses fake timers (Paper's menu popup opens through animation timers that starve on a loaded machine), and the outbox tests wait for a sent entry to be cleared instead of assuming it is gone the moment the gateway accepts the send.
- [ ] 6.2 Emulator screenshots: a reply with a delivered image, the spinner frame while it loads, an expanded image, chips for a report and a sound, and the chip for a file the gateway doesn't have
- [ ] 6.3 On the emulator against a real gateway: ask Hermes for a picture and a PDF, check the images render, tap to expand, and reopen the Session to see them read again
- [ ] 6.4 The owner installs it on their phone and sees an image Hermes delivered
