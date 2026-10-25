## Why

Approvals and Questions are why Matrix falls short: the agent stops and waits for the person. The phone has to show them clearly, answer them in one tap, and get the edge cases right. Those are answering after a reconnect, an Approval answered on the laptop first, and one that timed out while the phone was away.

## What Changes

- An Approval card pinned above the message box, with the command, its description, and the choices the gateway offers: **Run**, **Allow this session**, **Always allow** and **Reject**. "Always allow" asks for confirmation first, as on the desktop.
- A Question card pinned above the message box. It steps through one to five questions, with choices, multi-select and free text, and has Skip.
- The session shows Needs input while either card is waiting. The Sessions row shows it too.
- Cards come back after a reconnect, from the gateway's still-open requests.
- A card disappears when the request is answered on another device, cancelled, or timed out. A timed-out Approval leaves the desktop's "Approval timed out — the command was not run." note in the transcript.
- Requests the app can't handle yet (sudo password, secrets, vault, desktop-only requests) are declined in a way that still lets another device answer them.

## Capabilities

### New Capabilities
- `approvals-and-questions`: showing and answering Approvals and Questions, Needs input, and the request lifecycle.

### Modified Capabilities

None. The Needs input marker in `session-list` already covers sessions open on the phone; this change feeds it.

## Impact

- New components: Approval card and Question card, above the message box on the Session screen.
- New store, ported and trimmed from the desktop: `apps/desktop/src/store/prompts.ts`, `apps/desktop/src/store/clarify.ts`, and the `approval` and `clarify` handlers in `apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/server-requests.ts`.
- Gateway: the `approval` and `clarify` server requests, the `approval.respond` and `approval.pending` RPCs, and the `request.cancel` and `approval.cancelled` events.
