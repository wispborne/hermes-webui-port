## Why

The web UI now has a Memory review page that lists pending memories and lets the person approve or reject each one. The phone has nothing for them, so a memory Hermes holds while the owner is away from the laptop waits until they get back to it. The owner wants every web UI feature on the phone too.

## What Changes

- Settings is laid out like the web UI's settings dialog: a list of sections, each opening its own page, in the dialog's order and with its names. The phone has Appearance, Memory & Context, Notifications (Keep connected), Gateways (URL, who is signed in, Sign out) and About (the three versions).
- A Memory review screen, opened from Settings ▸ Memory & Context ▸ Pending memories. It lists each pending memory with the web page's labels: what it does (Add, Edit, Remove, Replace, Several changes), where it goes (Memory or User profile), "Background review" when Hermes suggested it on its own, the text, and the full memory an edit or removal changes.
- Approve and Reject on each pending memory. Approve all and Reject all when more than one waits, each after a confirmation.
- The "Ask before saving memories" switch (`memory.write_approval`).
- After an approve or reject, the gateway's reply is shown at the top of the list, including any memory text that was overwritten or removed.
- A Memory review button with the count in the Sessions screen's top bar, shown only while pending memories wait. The count updates when Sessions opens and every minute while it's on screen.
- Settings ▸ Memory & Context also has the "Ask before saving memories" switch.
- Like the web page, it reads the gateway's `/memory` command through `command.dispatch`. The phone uses the web plugin's parser and its tests, not a copy.
- `CONTEXT.md` defines Pending memory.

## Capabilities

### New Capabilities
- `memory-review`: listing pending memories on the phone, approving and rejecting them, and the approval switch.

### Modified Capabilities
- `gateway-connection`: Settings becomes a list of sections like the web settings dialog. The gateway URL, who is signed in and Sign out move to Gateways, and the versions move to About.

## Impact

- New: `mobile/src/store/memory-review.ts`, `mobile/src/screens/memory-review-screen.tsx`, `mobile/src/app/memory-review.tsx`, and their tests.
- Changed: `mobile/src/screens/settings-screen.tsx` (now the list of sections, with a page per section under `mobile/src/app/settings/`), `mobile/src/screens/sessions-screen.tsx` (the button and its count), `mobile/scripts/export-strings.mjs` (export `settings.sections`), `mobile/src/i18n/app-strings.ts`, `mobile/tsconfig.json` and `mobile/shared-resolution.js` (an import path for the web plugin's parser), `mobile/scripts/demo-gateway.mjs` (pending memories), `mobile/GATEWAY_PROTOCOL.md`, `CONTEXT.md`.
- Web reference: `apps/desktop/src/plugins/memory-review/`. Its `parse.ts` is shared. Its page is the behaviour to follow.
- No gateway change.
