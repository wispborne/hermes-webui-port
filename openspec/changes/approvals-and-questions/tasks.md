## 1. Store

- [ ] 1.1 Port and trim the desktop's approval queue (`store/prompts.ts`) and Question store (`store/clarify.ts`), keyed by stored session id
- [ ] 1.2 Register `approval` and `clarify` server-request handlers on the connection owner
- [ ] 1.3 Feed `open_requests` from resume and replay into the same handlers, deduplicated by request id
- [ ] 1.4 Mark the session Needs input while it has an open card

## 2. Answering

- [ ] 2.1 Respond to live requests with `{choice}` or `{answers}`
- [ ] 2.2 Fall back to `approval.respond` for Approvals restored from `approval.pending`, with the 330-second wait and one retry
- [ ] 2.3 Tests with the fake gateway: each choice, a Question with skip and multi-select, cancel all

## 3. Clearing

- [ ] 3.1 Remove cards on `request.cancel`, `approval.cancelled`, and missing from `open_requests`
- [ ] 3.2 The answered-elsewhere check after the turn moves on (`approval.pending` or resume)
- [ ] 3.3 Add the timed-out note to the transcript
- [ ] 3.4 Tests: timeout, Stop, answered elsewhere

## 4. Unsupported requests

- [ ] 4.1 Decline every other server request with code 4404 when the gateway reported `declines_not_shown`; otherwise answer `-32601`
- [ ] 4.2 Test that a decline doesn't settle the request while a second fake client is attached

## 5. Cards

- [ ] 5.1 Approval card: command (monospace, scrollable), description, the offered choices, "1 of N"
- [ ] 5.2 The Always allow confirmation, with the desktop's wording
- [ ] 5.3 Question card: one question at a time, choice buttons, checkboxes for multi-select, free text, Skip, Next, Back, Close
- [ ] 5.4 Typing in the message box while a Question is open fills the current free-text answer

## 6. Done

- [ ] 6.1 Type check and tests pass
- [ ] 6.2 Emulator screenshots: Approval card, stacked Approvals, Question card (choices, multi-select, free text), timed-out note
- [ ] 6.3 The owner answers a real Approval and a real Question on their phone, and checks the answered-on-the-laptop case
