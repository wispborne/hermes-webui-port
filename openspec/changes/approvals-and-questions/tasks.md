## 1. Store

- [x] 1.1 Port and trim the desktop's approval queue (`store/prompts.ts`) and Question store (`store/clarify.ts`), keyed by stored session id
- [x] 1.2 Register `approval` and `clarify` server-request handlers on the connection owner
- [x] 1.3 Feed `open_requests` from resume and replay into the same handlers, deduplicated by request id
- [x] 1.4 Mark the session Needs input while it has an open card

## 2. Answering

- [x] 2.1 Respond to live requests with `{choice}` or `{answers}`
- [x] 2.2 Fall back to `approval.respond` for Approvals restored from `approval.pending`, with the 330-second wait and one retry
- [x] 2.3 Tests with the fake gateway: each choice, a Question with skip and multi-select, cancel all

## 3. Clearing

- [x] 3.1 Remove cards on `request.cancel`, `approval.cancelled`, and missing from `open_requests`
- [x] 3.2 The answered-elsewhere check after the turn moves on (`approval.pending` or resume)
- [x] 3.3 Add the timed-out note to the transcript
- [x] 3.4 Tests: timeout, Stop, answered elsewhere

## 4. Unsupported requests

- [x] 4.1 Decline every other server request with code 4404 when the gateway reported `declines_not_shown`; otherwise answer `-32601`
- [x] 4.2 Test that a decline doesn't settle the request while a second fake client is attached

## 5. Cards

- [x] 5.1 Approval card: command (monospace, scrollable), description, the offered choices, "1 of N"
- [x] 5.2 The Always allow confirmation, with the desktop's wording
- [x] 5.3 Question card: one question at a time, choice buttons, checkboxes for multi-select, free text, Skip, Next, Back, Close
- [x] 5.4 Typing in the message box while a Question is open fills the current free-text answer

## 6. Done

- [x] 6.1 Type check and tests pass
- [x] 6.2 Emulator screenshots: Approval card, stacked Approvals, Question card (choices, multi-select, free text), timed-out note
- [ ] 6.3 The owner answers a real Approval and a real Question on their phone, and checks the answered-on-the-laptop case

## Notes

- 4.1: the shared channel keeps the gateway's `declines_not_shown` answer private, so the connection asks `client.capabilities` a second time after `gateway.ready` to learn it. When the gateway counts declines, the app answers code 4404 itself (the same frame `decline()` sends), so it doesn't depend on the channel having stored its own answer yet.
- 4.2: the fake gateway doesn't decide when a request settles. The test checks that the phone answers 4404 and that a second client (the "laptop") still receives the request and can answer it.
- Questions are cancelled with an empty result, as the protocol says. The free-text box on the card and the message box share one answer.
- Checked on the emulator against `mobile/scripts/demo-gateway.mjs`: a stack of three Approvals, Run, the Always allow confirmation, a timed-out Approval (the `t` key), and a Question with choices, multi-select and free text typed in the message box.
