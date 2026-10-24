## Context

- The gateway keeps a running turn going while no client is attached, and stops it only after 10 minutes with no activity. It keeps Approvals and Questions open for a client that reconnects. Approvals time out after 300 seconds by default (`mobile/GATEWAY_PROTOCOL.md`, section 10).
- The app's JavaScript (the gateway client, stores and handlers) runs in the app's process. A foreground service keeps that process alive while no screen is shown.
- Notifee, the usual library for running a foreground service from React Native, was archived by Invertase in April 2026. Its community fork has no confirmed current release.
- Android 15 limits the `dataSync` foreground service type to 6 hours in every 24.
- Per Android's documentation, a foreground service keeps an app out of App Standby, but not out of Doze's network cut-off. Apps the person exempts from battery optimisation keep network access in Doze.
- Android 14 and later need a declared foreground service type and its matching permission. Most types can't be started while the app is in the background.

## Goals / Non-Goals

**Goals:**
- An Approval that comes up while the phone is locked shows a notification within seconds, while the service runs.
- No battery cost when nothing is happening, unless the person turns on Keep connected.

**Non-Goals:**
- Watching sessions that aren't open on the phone (for example, a laptop-only session). That's a possible follow-up, and it would change how the gateway cleans up Live sessions.
- Push through Firebase or a server-side helper.
- Allow this session and Always allow from a notification. They stay in the app.

## Decisions

### A local Expo module for the service
`mobile/modules/hermes-background`, written in Kotlin with the Expo Modules API. It exposes:
- `startService(title, text)`
- `updateService(title, text)`
- `stopService()`
- `isIgnoringBatteryOptimizations()`
- `requestIgnoreBatteryOptimizations()`
- `flushCookies()`, used by `gateway-sign-in`

The service only keeps the process alive and shows the ongoing notification. All gateway logic stays in JavaScript, in the same process.

Alternatives considered:
- Notifee: archived.
- Its community fork: unconfirmed.
- A separate headless JavaScript task: it would run a second copy of the connection.

The owner is an Android developer, so a small Kotlin module is the most predictable option.

### Service type
`remoteMessaging`, Android's type for moving messages between a device and a server. It has no daily time limit. `dataSync` was rejected because of the 6-hour limit. `specialUse` would also work for a sideloaded app, and is the fallback if the trial below finds a problem.

### When it runs
- **On demand (default):** start when the app goes to the background while a session opened on the phone has a running turn or Needs input. Update the ongoing notification's text with what's happening ("Hermes is working", "Approval needed"). Stop 5 minutes after the last turn ends and nothing Needs input. Android only lets this type start while the app is in the foreground, so the app starts it at the moment it's leaving the screen (`AppState` change), when it's still allowed to.
- **Keep connected (setting):** start when the app opens and stay running. Start again after a reboot from a `BOOT_COMPLETED` receiver. A trial task checks that Android allows this type to start from that receiver.
- Turning Keep connected on asks for the notification permission (Android 13+) and the battery exemption, each explained first.

### Battery exemption
The first time the service starts, the app explains why it needs to run without battery restrictions, then opens Android's request (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). Play Store rules restrict that request, but this app is sideloaded. If the person declines, the service still runs. Settings then notes that the connection may drop while the phone is idle.

### Notifications
`expo-notifications`, with three channels: "Needs input" (high importance), "Finished" (default) and "Connection" (low, for the ongoing service notification).
- **Approval:** title from `notifications.native.approvalTitleNamed` ("Approval needed — {session}"), body is the command. Its action buttons are Run (`once`) and Reject (`deny`). Pressing one answers through the same code as the in-app card, without opening the app. The notification is removed when the card is removed (answered, cancelled, timed out, or answered elsewhere).
- **Question:** `notifications.native.inputTitleNamed` and the first question. Tapping it opens the session.
- **Hermes finished:** `notifications.native.turnDoneTitle`, only when the app isn't on screen.
- No notification is raised for a session the person has on screen.

A tap opens the session through the expo-router link `hermes://session/<stored id>`.

### Reconnecting
`@react-native-community/netinfo` and `AppState` trigger an immediate reconnect, skipping the backoff wait, when:
- the network comes back
- the network changes, for example from Wi-Fi to mobile data
- the app returns to the foreground

After reconnecting, every session on screen or watched by the service is resumed, and the shared client replays what was missed.

### Trial before building
A short trial task proves the parts this design assumes, on the emulator and on the owner's phone:
1. JavaScript timers and the WebSocket keep running with the screen off while the service runs.
2. The connection survives Doze with the battery exemption (`adb shell dumpsys deviceidle force-idle`).
3. A `remoteMessaging` service can start from the `AppState` background change and from `BOOT_COMPLETED`.
4. Notification action buttons work while the app isn't on screen.

The results are recorded in this file before the rest of the work.

**Trial results (2026-10-24, Pixel 9 Pro emulator, Android 16, debug build, against `mobile/scripts/demo-gateway.mjs`):**

1. **Screen off: works.** With a turn running, the app left the screen and the service started. With the screen off for 60 seconds, the WebSocket stayed open (the gateway saw no new connection), the turn finished, and the app's JavaScript posted "Hermes finished".
2. **Doze: works with the exemption.** With the app exempted from battery optimisation, the emulator was forced into deep idle (`adb shell dumpsys deviceidle force-idle`) mid-turn. The turn's end arrived and "Hermes finished" was posted 17 seconds into deep idle. Not tried without the exemption.
3. **Starting the service: works, with no fallback needed.** `remoteMessaging` (type `0x200` in `dumpsys`) starts from the `AppState` change as the app leaves the screen, and from the `BOOT_COMPLETED` receiver. After a reboot the service starts the React host, and the JavaScript checks the sign-in and opens the WebSocket with no screen shown. For that, the start check and the background rules now run from `mobile/index.ts` as the JavaScript loads, not from the root layout. Two things to know:
   - Android doesn't deliver `BOOT_COMPLETED` to an app that was force-stopped, until it's opened again. That is Android's rule for every app.
   - A debug build loads its JavaScript from Metro at boot, so Metro has to be running and reachable. A release build has the JavaScript inside it.
4. **Notification buttons: work off screen.** Run on an "Approval needed" notification answered the Approval (`{"choice":"once"}` reached the gateway) without opening the app, the notification went away, and the turn continued to "Hermes finished".

Still to check on the owner's phone: the same with a phone maker's battery manager, and a real Doze period instead of a forced one.

## Risks / Trade-offs

- [Phone makers' battery managers kill the service anyway] → The ongoing notification shows the service is alive. The app reconnects and catches up whenever it's opened, so nothing is lost, only delayed.
- [Keep connected uses battery all day] → It's off by default, and the heartbeat is the shared client's 15 seconds.
- [Answering from a notification races an answer on the laptop] → Same as in the app: the first answer wins and a late one is dropped harmlessly.
- [A trial check fails] → Each has a fallback: `specialUse` for the service type, and starting the service only from the foreground for the boot case.
