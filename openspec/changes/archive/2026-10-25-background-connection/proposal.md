## Why

Without this change, the app is only connected while it's on screen. An Approval that comes up while the phone is in a pocket waits unseen, and is denied after 5 minutes. A foreground service keeps the connection open while something is happening. That lets the app raise its own notifications without any server-side helper.

## What Changes

- A foreground service that keeps the gateway connection open while the app is in the background.
- By default, it runs only while a session opened on the phone has a turn running or Needs input, plus 5 minutes after. Then it stops.
- A "Keep connected" setting keeps it running all the time, including after the phone restarts.
- Local notifications, using the desktop's wording:
  - "Approval needed", with **Run** and **Reject** buttons
  - "Input needed" for a Question, which opens the session
  - "Hermes finished", when a turn ends while the app isn't on screen
- A one-time request to let the app run without battery restrictions, so Doze doesn't cut its network.
- Faster reconnects: reconnect at once when the network comes back or the app returns to the foreground, then catch up the open sessions.

## Capabilities

### New Capabilities
- `background-connection`: the foreground service, the Keep connected setting, notifications, and reconnecting on network and app changes.

### Modified Capabilities

None.

## Impact

- Native code: the local Expo module `mobile/modules/hermes-background` (Kotlin), created in `gateway-sign-in` for the cookie flush, gains the foreground service and the battery-exemption request.
- New dependencies: `expo-notifications` (local notifications with action buttons) and `@react-native-community/netinfo`.
- New Android permissions: `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_REMOTE_MESSAGING`, `RECEIVE_BOOT_COMPLETED` and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- Settings gets the Keep connected switch.
