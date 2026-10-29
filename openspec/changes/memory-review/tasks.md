## 1. Shared parser and terms

- [x] 1.1 Map `@hermes/memory-review/*` to `apps/desktop/src/plugins/memory-review/*` in `mobile/tsconfig.json` and `mobile/shared-resolution.js`
- [x] 1.2 Add the phone's `memoryReview` strings to `mobile/src/i18n/app-strings.ts`, with the web page's wording
- [x] 1.3 Define Pending memory in `CONTEXT.md`

## 2. Store

- [x] 2.1 `mobile/src/store/memory-review.ts`: the last answer, loading and error, `reloadMemoryReview()` and `runMemoryCommand(arg)` over `command.dispatch`
- [x] 2.2 Tests with the fake gateway: the list loads, an approve sends `approve <id>` and reloads, a failed reply is marked, the switch sends `approval off`, an unreadable reply is kept as text, and a dropped connection keeps the last list

## 3. Screens

- [x] 3.1 Memory review screen and its route, with the switch, the reply card, the cards, the menu with Approve all and Reject all, and the confirmation dialog
- [x] 3.2 The Sessions screen's button, its count, and the one-minute reload while Sessions is focused
- [x] 3.3 Screen test: cards render from a gateway answer, and Approve sends the right command

## 4. Demo gateway and protocol notes

- [x] 4.1 `command.dispatch` for `memory` in `mobile/scripts/demo-gateway.mjs`, with made-up pending memories
- [x] 4.2 Describe `/memory` through `command.dispatch` in `mobile/GATEWAY_PROTOCOL.md`

## 5. Done

- [x] 5.1 Type check and tests pass, including the web plugin's parser tests
- [x] 5.2 Emulator screenshots: Sessions with the count, the list, a reply after an approve, the confirmation, and the empty screen
- [x] 5.3 On the emulator against a v0.22.5 gateway: approve, reject, approve all, and the switch, checking the gateway's memory files after each
- [ ] 5.4 The owner installs it on their phone and approves or rejects a pending memory
