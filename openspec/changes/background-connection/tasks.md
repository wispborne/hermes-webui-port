## 1. Trial

- [ ] 1.1 Add a minimal `remoteMessaging` foreground service to the `hermes-background` module
- [ ] 1.2 Check that JavaScript timers and the WebSocket keep running with the screen off while it runs
- [ ] 1.3 Check that the connection survives `adb shell dumpsys deviceidle force-idle` with the battery exemption
- [ ] 1.4 Check that the service can start from the `AppState` background change and from `BOOT_COMPLETED`
- [ ] 1.5 Check that `expo-notifications` action buttons work while the app isn't on screen
- [ ] 1.6 Record the results, and any fallback used, in this change's design.md

## 2. Native module

- [ ] 2.1 Finish the service in `hermes-background`: start, update, stop, and the battery-exemption check and request
- [ ] 2.2 Add the permissions and the service and boot receiver declarations through the module's config plugin

## 3. Service control

- [ ] 3.1 Track whether any session opened on the phone is running or Needs input
- [ ] 3.2 Start the service when the app leaves the screen in that state; update its text as things change
- [ ] 3.3 Stop it 5 minutes after nothing is running or Needs input
- [ ] 3.4 Keep connected: start on app open and on boot; stop when turned off
- [ ] 3.5 Tests for the start and stop rules with a fake clock

## 4. Permissions

- [ ] 4.1 Explain, then ask for the notification permission
- [ ] 4.2 Explain, then ask for the battery exemption; note a refusal in Settings
- [ ] 4.3 Add the Keep connected switch and the battery note to Settings

## 5. Notifications

- [ ] 5.1 Create the three channels
- [ ] 5.2 Approval notification with Run and Reject actions, answering through the card's code
- [ ] 5.3 Question notification; Hermes finished notification only when the app isn't on screen
- [ ] 5.4 Remove notifications when their card is removed
- [ ] 5.5 Open the session from a tap through `hermes://session/<stored id>`
- [ ] 5.6 Tests: which events raise which notification, removal, nothing for the session on screen

## 6. Reconnecting

- [ ] 6.1 Reconnect at once on network return, network change and app foreground, skipping the backoff wait
- [ ] 6.2 Resume every session on screen or watched by the service after reconnecting
- [ ] 6.3 Tests with the fake gateway and a fake network state

## 7. Done

- [ ] 7.1 Type check and tests pass
- [ ] 7.2 Emulator screenshots: ongoing notification, Approval notification with buttons, Settings with Keep connected
- [ ] 7.3 The owner locks their phone mid-turn, answers an Approval from the notification, and gets "Hermes finished"
- [ ] 7.4 The owner leaves Keep connected on for a day and reports battery use
