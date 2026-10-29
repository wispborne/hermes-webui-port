## Why

The web UI now has a Memory review page that lists pending memories and lets the person approve or reject each one. The phone has nothing for them, so a memory Hermes holds while the owner is away from the laptop waits until they get back to it. The owner wants every web UI feature on the phone too.

## What Changes

- A Memory review screen, opened from a button on the Sessions screen's top bar. It lists each pending memory with the web page's labels: what it does (Add, Edit, Remove, Replace, Several changes), where it goes (Memory or User profile), "Background review" when Hermes suggested it on its own, the text, and the full memory an edit or removal changes.
- Approve and Reject on each pending memory. Approve all and Reject all when more than one waits, each after a confirmation.
- The "Ask before saving memories" switch (`memory.write_approval`).
- After an approve or reject, the gateway's reply is shown at the top of the list, including any memory text that was overwritten or removed.
- A count on the Sessions screen's button while pending memories wait. It updates when Sessions opens and every minute while it's on screen.
- Like the web page, it reads the gateway's `/memory` command through `command.dispatch`. The phone uses the web plugin's parser and its tests, not a copy.
- `CONTEXT.md` defines Pending memory.

## Capabilities

### New Capabilities
- `memory-review`: listing pending memories on the phone, approving and rejecting them, and the approval switch.

### Modified Capabilities

None.

## Impact

- New: `mobile/src/store/memory-review.ts`, `mobile/src/screens/memory-review-screen.tsx`, `mobile/src/app/memory-review.tsx`, and their tests.
- Changed: `mobile/src/screens/sessions-screen.tsx` (the button and its count), `mobile/src/i18n/app-strings.ts`, `mobile/tsconfig.json` and `mobile/shared-resolution.js` (an import path for the web plugin's parser), `mobile/scripts/demo-gateway.mjs` (pending memories), `mobile/GATEWAY_PROTOCOL.md`, `CONTEXT.md`.
- Web reference: `apps/desktop/src/plugins/memory-review/`. Its `parse.ts` is shared. Its page is the behaviour to follow.
- No gateway change.
