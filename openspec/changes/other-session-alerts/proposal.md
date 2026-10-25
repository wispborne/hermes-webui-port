## Why

The phone only hears about Approvals and Questions in sessions it has opened itself. When the owner starts a long turn on the laptop and walks away, and the turn stops on an Approval, the phone stays silent. The Approval is denied after 5 minutes. The owner wants the phone to alert them.

## What Changes

- While Keep connected is on, the app asks the gateway for `session.active_list` every 10 seconds, whether or not the app is on screen.
- When a session the phone hasn't opened has been waiting (Needs input) for 30 seconds, the app alerts:
  - If the gateway lets one connection detach from a session (`session.resume` returns a `subscription_id`), the app attaches to the session, raises the usual Approval or Question notification with Run and Reject, and detaches with `session.detach` once the request is settled.
  - Otherwise the app raises a plain "Input needed" notification without buttons, and doesn't attach. Tapping it opens the session, which shows the card.
- The plain notification is removed when the session stops waiting.
- No "Hermes finished" alert for sessions the phone hasn't opened.
- Keep connected's description says it also alerts for sessions on other devices.
- An ADR records why the phone checks the list instead of staying attached to every Live session.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `background-connection`: Keep connected also watches for sessions the phone hasn't opened that need input, with new requirements for the check, the wait, the two kinds of alert, and detaching.

## Impact

- New: `mobile/src/background/watch.ts` (the rules, tested with a fake clock), `docs/adr/0003-phone-checks-for-waiting-sessions.md`.
- Changed: `mobile/src/background/wiring.ts`, `mobile/src/background/notifications.ts`, `mobile/src/store/chat.ts` (attach and detach without opening the screen), `mobile/src/i18n/app-strings.ts`, `mobile/scripts/demo-gateway.mjs` (a session started elsewhere that waits, and optional `subscription_id` and `session.detach`), `mobile/GATEWAY_PROTOCOL.md`.
- No gateway change.
