## Context

- The gateway sends Approvals and Questions only to the connections attached to that session. No event tells other connections that a session needs input or that a turn finished.
- `session.active_list` lists every Live session, from every device. Each row has a `status`, and `waiting` means a request is pending. The row doesn't say which request. Nothing pushes changes to the list, so the desktop asks for it on a timer, and the app's Sessions screen does the same every 10 seconds while on screen.
- Any connection can attach to a Live session with `session.resume`. It then gets the same Approval and Question frames as the other attached connections. Requests that were already waiting come only in the answer's `open_requests`, not as frames. The first answer wins.
- While any connection is attached, the gateway never unloads the session.
- The gateway has two ways of serving the WebSocket (`tui_gateway/ws.py`, `_authority_connection`):
  - **With a session authority:** `session.resume` returns a `subscription_id`, and `session.detach {session_id, subscription_id}` drops that one connection's subscription without closing the session for anyone else.
  - **Without one (the older path):** there's no `subscription_id`, and the only way to stop being attached is to close the connection.
  
  Which one the owner's gateway uses isn't known yet.
- `session.close` unloads the Live session for every device. The app must never send it for a session it didn't start.
- Today, a session opened on the phone stays attached until the connection closes (`closeChat` in `mobile/src/store/chat.ts`). With Keep connected on, that's indefinitely. This change doesn't alter that.
- `ServiceControl` (`mobile/src/background/service-control.ts`) runs the foreground service and keeps the connection open while Keep connected is on.

## Goals / Non-Goals

**Goals:**
- An alert within about 40 seconds when a session on another device starts waiting, while Keep connected is on.
- No alert for a request the person answers at the laptop within 30 seconds.
- The gateway can still unload sessions from other devices once they're idle.

**Non-Goals:**
- "Hermes finished" for sessions on other devices.
- Alerts while Keep connected is off. Without an open connection the phone can't hear anything.
- Changing how long sessions opened on the phone stay attached.
- Any gateway change, or a push service.

## Decisions

### Checking the list

A new `Watch` class in `mobile/src/background/watch.ts` holds the rules. Its timers and gateway calls are passed in, like `ServiceControl`, so the tests use a fake clock.

- It runs while Keep connected is on, the person is signed in and the connection is open. It doesn't care whether the app is on screen.
- Every 10 seconds (`WATCH_POLL_MS`) it asks for `session.active_list`. It also asks straight after the connection opens.
- For each row with status `waiting` whose stored id isn't attached on the phone (not in `$localMarkers`), it notes when it first saw the row waiting.
- When a row has been waiting for 30 seconds (`ALERT_AFTER_MS`) and hasn't been alerted, it alerts (see below).
- A row that's no longer waiting, or no longer listed, is forgotten. Its plain notification, if any, is removed.
- The result of each check also updates `$remoteMarkers`, so the Sessions list is current when the app opens.

Alternative considered: staying attached to every Live session. Rejected, because the gateway would never unload any of them while the phone is connected (see the ADR).

### Alerting

On the first alert for a session, the app attaches to it with `session.resume` without opening the Session screen (`watchChat(key)` in `chat.ts`). This is the same attach that `openChat` does, without loading the transcript.

- **If the answer has a `subscription_id`:** the session's waiting requests arrive as cards in `$prompts`, the usual way. The existing `Notifications.promptsChanged` raises the Approval notification with Run and Reject, or the Question notification, with the session's title. When the session has no cards left, the app sends `session.detach` and forgets the session. It doesn't detach while the person has the session open on screen.
- **If there's no `subscription_id`:** the app can't detach, so it doesn't attach at all. It raises a plain notification, "Input needed — {session}", with the body from `notifications.native.inputBody` and no buttons. The id is `waiting:<stored id>`. Tapping it opens the session, which attaches as usual and shows the card. The notification is removed when the session stops waiting.

The app learns which kind of gateway it has from the first `session.resume` it sends on each connection, including ones made by opening a session. Until it knows, the watch makes one attach to find out. If that answer has no `subscription_id`, the app sends no detach, so that one session stays attached until the connection closes, like a session opened on the phone.

### Requests that arrive during a resume

The shared channel hands a resume's `open_requests` to the request handlers when the answer arrives, before `attach` has linked the new runtime id to the session. The approvals store used to decline them as "not shown here". That could settle the request if no other device showed the session, and it also hid the card when a waiting session was opened on the phone. While a resume is in flight (`isResuming`), the store now holds requests for an unknown runtime id. It handles them once `attach` has linked it, and declines only those that still match no session.

### Timers in the background

React Native on Android pauses JavaScript timers when the app leaves the screen, unless a headless JS task is running (`JavaTimerManager`). Incoming WebSocket messages still reach JavaScript, but `setTimeout` doesn't fire. So the watch's 10-second check never ran with the app in the background. Neither did the service's 5-minute stop delay or the connection's retry backoff.

The native module now starts a headless task, `HermesKeepTimers`, in `startService` and finishes it in `stopService`. The task never ends by itself (`src/background/boot.ts`). While the foreground service runs, so do the app's timers.

### Detaching after an answer

Answering removes the card before the answer frame is sent, in the same tick. A detach triggered by the card going away would then reach the gateway before the answer. `detachIfSettled` checks one tick later, so the detach always follows the answer on the socket.

### Wording

- The plain notification uses the desktop's `notifications.native.inputTitleNamed` and `inputBody` strings, so it reads like the desktop's.
- Keep connected's description gets one more sentence: "Also alerts you when a session on another device needs your input."

### Demo gateway

`mobile/scripts/demo-gateway.mjs` gets a flag, `--detach`, that adds a `subscription_id` to `session.resume` answers and accepts `session.detach`. Its existing `a` key already makes a session the phone hasn't opened wait on an Approval.

That covers both kinds of gateway on the emulator.

## Risks / Trade-offs

- [Checking every 10 seconds costs battery] → It only runs while Keep connected is on, which already keeps the connection open. The owner's day-long battery check covers it.
- [The owner's gateway is the older kind] → They get the plain notification. One tap opens the session with Run and Reject. Nothing stays attached.
- [The phone attaches to a session the laptop is using] → Both devices get the request. The first answer wins, and the phone removes its card when the turn moves on (the existing check for requests answered elsewhere).
- [A request is answered at the laptop between the check and the attach] → The resume's `open_requests` is empty. No card means no notification, and the app detaches.
- [Two requests in a row in the same session] → The session keeps waiting, so the app stays attached, and each request raises its own notification.
