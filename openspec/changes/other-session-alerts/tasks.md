## 1. Watch rules

- [ ] 1.1 Write `mobile/src/background/watch.ts`: check every 10 seconds while Keep connected is on, signed in and connected; track when each unopened session started waiting; alert at 30 seconds; forget rows that stop waiting
- [ ] 1.2 Tests with a fake clock: alert at 30 s and not before; no alert when answered at 20 s; one alert per wait; nothing while Keep connected is off; sessions opened on the phone are skipped

## 2. Attach and detach

- [ ] 2.1 Add `watchChat(key)` to `chat.ts`: `session.resume` without the transcript, and note whether the answer has a `subscription_id`
- [ ] 2.2 Add `detachChat(key)`: `session.detach` with the subscription id, skipped while the session is on screen
- [ ] 2.3 Remember per connection whether the gateway gives subscriptions, from any `session.resume` answer
- [ ] 2.4 Tests against the fake gateway, with and without `subscription_id`: attach raises the card notification; detach after the card is settled; no `session.close` is ever sent

## 3. Notifications

- [ ] 3.1 Add the plain "Input needed — {session}" notification (`waiting:<stored id>`), shown and removed by the watch
- [ ] 3.2 Add the sentence to Keep connected's description in `app-strings.ts`
- [ ] 3.3 Tests: plain notification shown, removed when the session stops waiting, and opens the session when tapped

## 4. Demo gateway and docs

- [ ] 4.1 Add the `w` key and the `--detach` flag to `demo-gateway.mjs`
- [ ] 4.2 Add `session.detach` and the two kinds of gateway to `GATEWAY_PROTOCOL.md`
- [x] 4.3 Write `docs/adr/0003-phone-checks-for-waiting-sessions.md`

## 5. Done

- [ ] 5.1 Type check and tests pass
- [ ] 5.2 On the emulator, with the demo gateway both with and without `--detach`: lock the phone, press `w`, get the alert after about 30–40 seconds, answer it, and check the gateway's log for `session.detach` (or no attach)
- [ ] 5.3 The owner starts a turn on the laptop that waits on an Approval, leaves it, and gets the alert on the phone. Note here which kind of alert their gateway gives.

## Notes
