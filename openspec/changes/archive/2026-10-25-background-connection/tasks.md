## 1. Trial

- [x] 1.1 Add a minimal `remoteMessaging` foreground service to the `hermes-background` module
- [x] 1.2 Check that JavaScript timers and the WebSocket keep running with the screen off while it runs
- [x] 1.3 Check that the connection survives `adb shell dumpsys deviceidle force-idle` with the battery exemption
- [x] 1.4 Check that the service can start from the `AppState` background change and from `BOOT_COMPLETED`
- [x] 1.5 Check that `expo-notifications` action buttons work while the app isn't on screen
- [x] 1.6 Record the results, and any fallback used, in this change's design.md

## 2. Native module

- [x] 2.1 Finish the service in `hermes-background`: start, update, stop, and the battery-exemption check and request
- [x] 2.2 Add the permissions and the service and boot receiver declarations through the module's config plugin

## 3. Service control

- [x] 3.1 Track whether any session opened on the phone is running or Needs input
- [x] 3.2 Start the service when the app leaves the screen in that state; update its text as things change
- [x] 3.3 Stop it 5 minutes after nothing is running or Needs input
- [x] 3.4 Keep connected: start on app open and on boot; stop when turned off
- [x] 3.5 Tests for the start and stop rules with a fake clock

## 4. Permissions

- [x] 4.1 Explain, then ask for the notification permission
- [x] 4.2 Explain, then ask for the battery exemption; note a refusal in Settings
- [x] 4.3 Add the Keep connected switch and the battery note to Settings

## 5. Notifications

- [x] 5.1 Create the three channels
- [x] 5.2 Approval notification with Run and Reject actions, answering through the card's code
- [x] 5.3 Question notification; Hermes finished notification only when the app isn't on screen
- [x] 5.4 Remove notifications when their card is removed
- [x] 5.5 Open the session from a tap through `hermes://session/<stored id>`
- [x] 5.6 Tests: which events raise which notification, removal, nothing for the session on screen

## 6. Reconnecting

- [x] 6.1 Reconnect at once on network return, network change and app foreground, skipping the backoff wait
- [x] 6.2 Resume every session on screen or watched by the service after reconnecting
- [x] 6.3 Tests with the fake gateway and a fake network state

## 7. Done

- [x] 7.1 Type check and tests pass
- [x] 7.2 Emulator screenshots: ongoing notification, Approval notification with buttons, Settings with Keep connected
- [x] 7.3 The owner locks their phone mid-turn, answers an Approval from the notification, and gets "Hermes finished"

## Notes

- 2.2: the permissions, the service and the boot receiver are declared in the module's own `AndroidManifest.xml`, which Android's build merges into the app's. That needs no config plugin, and survives `expo prebuild`.
- The ongoing notification's channel ("Connection", low importance) is created by the service itself. The other two channels and the Run and Reject buttons are set up by expo-notifications.
- The notification and battery requests are explained and asked the first time a message is sent, and again when Keep connected is turned on.
- Found and fixed while checking on the emulator: expo-sqlite's exclusive transactions open a second connection, so saving a transcript during other writes failed with "database is locked". Transactions now run one at a time on the main connection.
- Not yet done when archived: the owner leaves Keep connected on for a day and reports battery use (was task 7.4).
