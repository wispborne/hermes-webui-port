## 1. Watch rules

- [x] 1.1 Write `mobile/src/background/watch.ts`: check every 10 seconds while Keep connected is on, signed in and connected; track when each unopened session started waiting; alert at 30 seconds; forget rows that stop waiting
- [x] 1.2 Tests with a fake clock: alert at 30 s and not before; no alert when answered at 20 s; one alert per wait; nothing while Keep connected is off; sessions opened on the phone are skipped

## 2. Attach and detach

- [x] 2.1 Add `watchChat(key)` to `chat.ts`: `session.resume` without the transcript, and note whether the answer has a `subscription_id`
- [x] 2.2 Add `detachChat(key)`: `session.detach` with the subscription id, skipped while the session is on screen
- [x] 2.3 Remember per connection whether the gateway gives subscriptions, from any `session.resume` answer
- [x] 2.4 Tests against the fake gateway, with and without `subscription_id`: attach raises the card notification; detach after the card is settled; no `session.close` is ever sent

## 3. Notifications

- [x] 3.1 Add the plain "Input needed — {session}" notification (`waiting:<stored id>`), shown and removed by the watch
- [x] 3.2 Add the sentence to Keep connected's description in `app-strings.ts`
- [x] 3.3 Tests: plain notification shown, removed when the session stops waiting, and opens the session when tapped

## 4. Demo gateway and docs

- [x] 4.1 Add the `--detach` flag to `demo-gateway.mjs` (its existing `a` key already makes a session the phone hasn't opened wait)
- [x] 4.2 Add `session.detach` and the two kinds of gateway to `GATEWAY_PROTOCOL.md`
- [x] 4.3 Write `docs/adr/0003-phone-checks-for-waiting-sessions.md`

## 5. Done

- [x] 5.1 Type check and tests pass
- [x] 5.2 On the emulator, with the demo gateway both with and without `--detach`: lock the phone, press `a`, get the alert after about 30–40 seconds, answer it, and check the gateway's log for `session.detach` (or no attach)
- [ ] 5.3 The owner starts a turn on the laptop that waits on an Approval, leaves it, and gets the alert on the phone. Note here which kind of alert their gateway gives.

## Notes

- Found while building: a resume's `open_requests` reached the approvals store before `attach` had linked the runtime id, so they were declined as "not shown here". That hid the card when a waiting session was opened, and could settle the request if no other device showed the session. The store now holds them during a resume (see the design's "Requests that arrive during a resume").
- The demo gateway's existing `a` key already makes a session the phone hasn't opened wait, so no `w` key was added.
- 5.2 found that JavaScript timers stop in the background, so the watch never checked. The native module now runs a headless task while the foreground service is on (see the design's "Timers in the background"). This also fixes the service's 5-minute stop delay and the retry backoff in the background.
- 5.2 also found the detach reaching the gateway before the Run answer. The check now runs a tick later (see "Detaching after an answer").
- 5.2 results, on a release build on the emulator, with the app in the background:
  - Older gateway (no `--detach`): "Input needed — Weekly report summary" with no buttons, about 34 seconds after the watch started. Tapping it opened the session with its Approval card. Run worked. The phone never attached to the session before the tap.
  - Gateway with `--detach`: the Approval notification with Run and Reject, 41 seconds after the turn started waiting. Run from the shade answered it, then `session.detach` with the subscription went out, then the turn finished. No `session.close` was sent.

