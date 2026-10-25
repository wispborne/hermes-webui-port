## Why

Hermes sometimes stops a turn to ask for a sudo password, an API key, or a password manager's master password. The phone declines these today, so only the laptop can answer them. When the laptop has left the session, the gateway settles the request as soon as the phone declines it, and the tool fails. When the phone attaches to a session from another device to alert the owner, it declines the request and raises no alert. The owner wants to answer these from the phone like Approvals.

## What Changes

- A Private input card pinned above the message box for five requests: `sudo`, `secret`, `vault.unlock_prompt`, `vault.save_login` and `vault.code`. It has the desktop's title, description, buttons and fields for each one.
- Password and key fields are hidden as the person types, with a button to show them. Android's password manager and SMS code autofill can fill them.
- Cancel (or Keep locked, Don't save, Skip) sends an empty answer, as on the desktop. The gateway treats it as a refusal.
- What the person types is sent once and then cleared. It's never saved on the phone, never put in the Outbox or the transcript, and never shown in a notification.
- The session shows Needs input while the card waits. The card comes back after a reconnect and is removed when the request is answered on another device, cancelled, or timed out, like the other cards.
- An "Input needed" notification without buttons. Tapping it opens the session.
- Every other request the phone can't show is still declined as "not shown here".
- `CONTEXT.md` defines Private input, and Needs input includes it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `approvals-and-questions`: new requirements for the Private input card, answering it, and keeping what's typed off the phone. "Requests the app can't handle" no longer covers sudo and secret prompts. Needs input, reconnects and stale cards cover the new card.
- `background-connection`: a notification for a Private input card.

## Impact

- Changed: `mobile/src/store/prompts.ts` (a third kind of card), `mobile/src/components/chat/prompt-cards.tsx` (the card), `mobile/src/background/notifications.ts`, `mobile/src/background/wiring.ts` (detach once no card of any kind waits), `mobile/scripts/export-strings.mjs` (export `prompts`), `mobile/src/i18n/app-strings.ts`, `mobile/scripts/demo-gateway.mjs` (a turn that asks for each kind), `mobile/GATEWAY_PROTOCOL.md`, `CONTEXT.md`.
- Desktop reference: `apps/desktop/src/components/prompt-overlays.tsx`, the `sudo`, `secret` and `vault.*` handlers in `apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/server-requests.ts`, and their types in `apps/desktop/src/store/prompts.ts`.
- No gateway change.
