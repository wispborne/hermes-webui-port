## Context

Protocol: `mobile/GATEWAY_PROTOCOL.md`, section 9. The facts this design depends on, checked in the gateway source (`tui_gateway/server_requests.py`, Hermes 0.22.4):
- Approvals and Questions arrive as server requests (`approval`, `clarify`) with a string id. They're answered with a JSON-RPC response carrying the same id.
- Approval choices are `once`, `session`, `always` and `deny`. The desktop labels them Run, Allow this session, Always allow and Reject. `allow_permanent: false` hides Always allow.
- A Question's answer is `{answers: {<qid>: <text> | <list> | null}}`. `null` means skipped. A response without `answers` cancels all the questions.
- The gateway keeps unanswered requests open across disconnects and returns them in `open_requests` from `session.resume` and `session.events.since`.
- **An error response settles a request at once**, even when another client could have answered it.
- **A decline with error code 4404 ("not shown") does not settle it** until every attached client that answers requests has declined. The gateway reports that it counts declines with `declines_not_shown: true` in the `client.capabilities` answer. The shared channel's `request.decline()` sends it.
- A response to a request that's already settled is dropped, with no reply.
- **The gateway does not tell other clients when one client answers a request.**
- `request.cancel {id, reason}` is sent when a request times out or is cancelled. `approval.cancelled` is sent when pending approvals are dropped by Stop or teardown.
- Approval timeout: `approvals.timeout`, 300 seconds by default. Question timeout: `agent.clarify_timeout`, 3600 seconds by default.

## Goals / Non-Goals

**Goals:**
- One tap to answer an Approval.
- Never show a card that can no longer be answered for long.
- Never stop the laptop from answering something the phone can't.

**Non-Goals:**
- Notifications for Approvals and Questions (the background-connection change).
- sudo, secret and vault prompts. They are declined for now.
- Editing a Question answer after it's sent. The desktop's per-question locking (`clarify.lock`) isn't used; the phone sends all answers at once.

## Decisions

### Where the cards live
Both cards are pinned above the message box, not inline in the transcript. On a phone, the transcript may be scrolled anywhere, and the message box is where the eye goes. While a card is shown, the message box stays usable: typing text while a Question is open fills in the current question's free-text answer, as on the desktop.

Several Approvals for one session form a stack: one card is shown, with "1 of 3". This is the desktop's approval queue in `store/prompts.ts`.

### Answering
- Live request: respond to the request id with `{choice}`, or `{answers}` for a Question.
- Request restored from `approval.pending` with no live request id: call `approval.respond {session_id, request_id, choice}`.
- Timeouts: wait up to 330 seconds for `approval.respond`, as the desktop does, and retry once on a timeout. Answering twice is harmless.
- "Always allow" opens the desktop's confirm dialog ("Always allow this command?" and its description) before sending.

### Questions
The card shows one question at a time with its choices as buttons, multi-select as checkboxes, and a free-text field. Next and Back move between questions. The last question's button sends all the answers. Skip sets `null` for that question. A Close action cancels all the questions after a confirmation. The "(recommended)" label the gateway adds to the first choice is shown as a small tag.

### Clearing stale cards
A card is removed when any of these happens:
- the person answers it
- `request.cancel` with its id arrives (timeout or cancel)
- `approval.cancelled` lists its request id
- a resume or replay returns `open_requests` without it
- **another device answered it.** The gateway doesn't say so directly. So when a session event shows the turn moved on after the request arrived (`tool.complete`, `message.delta`, `message.complete` or a new server request), the app calls `approval.pending` for an Approval, or resumes for a Question, and drops cards that are no longer open.

On `request.cancel` with reason `timeout` for an Approval, the transcript gets the desktop's "Approval timed out — the command was not run." note.

### Requests the app can't handle
Every other server request (`sudo`, `secret`, `vault.*`, `preview.*`, `terminal.read`, `window.read`, `tour`, `theme.*`, `setup_beat`, `display.install.sudo`) is declined with code 4404, through the shared channel's `decline()`. Then a laptop showing the same session can still answer it. If the gateway didn't report `declines_not_shown`, the app answers `-32601` instead, as the shared channel does by default.

### Needs input
The session store marks a session Needs input while it has an open card. The Sessions row reads that for sessions open on the phone, and `session.active_list`'s `waiting` status for the rest.

## Risks / Trade-offs

- [A card answered on the laptop stays on the phone until the turn moves on] → The check above runs on the next session event, which comes within seconds when the turn continues. A stale answer is dropped harmlessly.
- [Declining sudo prompts makes those tools fail when only the phone is attached] → It's the same outcome the agent gets from any client that can't answer. A later change can add the masked-input cards.
