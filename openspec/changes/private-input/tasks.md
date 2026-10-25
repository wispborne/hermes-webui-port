## 1. Strings and terms

- [ ] 1.1 Add `prompts` to `EXPORTED` in `mobile/scripts/export-strings.mjs` and run `npm --prefix mobile run strings`
- [ ] 1.2 Add the phone's own `vaultUnlockDesc` and `vaultSaveDesc` lines to `mobile/src/i18n/app-strings.ts`, saying "the gateway's computer". Use a desktop string for the eye button's label if one exists.
- [x] 1.3 Define Private input in `CONTEXT.md`, and add it to Needs input

## 2. Store

- [ ] 2.1 Add a third kind of card to `mobile/src/store/prompts.ts`: a stack of Private inputs per session, with the request's kind and params, keyed by request id. It holds nothing the person types.
- [ ] 2.2 Handle `sudo`, `secret`, `vault.unlock_prompt`, `vault.save_login` and `vault.code`, including those held during a resume. Keep declining every other request.
- [ ] 2.3 Count Private inputs in `needsInput`
- [ ] 2.4 Answer with `{value}`, `{value: ""}` for the cancel button, the JSON string for a saved login, and the code with spaces and dashes taken out
- [ ] 2.5 Remove Private inputs on `request.cancel`, `message.complete`, and when missing from `open_requests`. Add them to the answered-elsewhere check, using a resume as for Questions.
- [ ] 2.6 Tests with the fake gateway: each kind's answer, cancel sends an empty value, a timeout removes the card with no note, answered elsewhere, re-delivery after a reconnect keeps one card, and `terminal.read` is still declined with 4404

## 3. Card

- [ ] 3.1 Private input card in `mobile/src/components/chat/prompt-cards.tsx`, with the title, description, fields and buttons from the design's table, and "1 of N"
- [ ] 3.2 Hidden fields with an eye button, autofill hints, no focus when the card appears, and the typed text kept in the card's own state and cleared on send and on removal
- [ ] 3.3 Buttons disabled while the connection isn't open, and the desktop's "Could not send …" line on a failed send
- [ ] 3.4 The message box doesn't fill a Private input card
- [ ] 3.5 Test: after sending a password, no table in the phone's database holds it, and the notification text doesn't either

## 4. Notifications and watched sessions

- [ ] 4.1 "Input needed — {session}" for the first Private input, with the desktop's body for each kind and no buttons. Removed with its card.
- [ ] 4.2 `detachIfSettled` in `mobile/src/background/wiring.ts` waits until no card of any kind is left
- [ ] 4.3 Tests in `notifications.test.ts` for the new notification and its removal

## 5. Demo gateway and protocol notes

- [ ] 5.1 Add a key to `mobile/scripts/demo-gateway.mjs` that starts a turn asking for each of the five in turn, and logs whether each answer was empty and how long it was, never the answer itself. The `t` key times out these requests too.
- [ ] 5.2 Describe the five requests, their params, answers and timeouts in section 9 of `mobile/GATEWAY_PROTOCOL.md`

## 6. Done

- [ ] 6.1 Type check and tests pass
- [ ] 6.2 Emulator screenshots: each of the five cards, a shown password, and the "Input needed" notification
- [ ] 6.3 On the emulator with the demo gateway: send and cancel each kind, a timeout, and a request answered from a second client. Check the gateway's log for each answer.
- [ ] 6.4 The owner asks Hermes on their phone to run a command that needs sudo, and sends the password from the phone. They also cancel one, and type one on the laptop while the phone shows it.
- [ ] 6.5 The owner starts a turn on the laptop that waits on a sudo password, leaves it, and answers it from the phone after the alert
