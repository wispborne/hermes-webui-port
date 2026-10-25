## ADDED Requirements

### Requirement: Saved data stays on the phone and in the app
The app SHALL save its data in storage that is private to the app. It SHALL NOT write saved data anywhere other apps can read.

#### Scenario: Another app looks for the data
- **WHEN** another app on the phone tries to read the Hermes app's saved data
- **THEN** Android refuses, because the data is in the app's private storage

### Requirement: The gateway is always right
Saved data SHALL be a copy of what the gateway holds. Whenever the app gets fresh data from the gateway, it SHALL replace the saved copy with it. The only data that exists just on the phone is the outbox.

#### Scenario: Something changed on another device
- **WHEN** a session was renamed in the web UI while the phone was offline, and the phone then reconnects
- **THEN** the app shows and saves the new name

#### Scenario: Saved data is shown first
- **WHEN** the app opens a screen whose data it has saved
- **THEN** it shows the saved data at once, then replaces it with the gateway's data when that arrives

### Requirement: Saved data belongs to one gateway
Saved data SHALL be kept per gateway. Data from one gateway SHALL never be shown for another.

#### Scenario: Different gateway URL
- **WHEN** the person changes the gateway URL to a different gateway
- **THEN** the app shows none of the previous gateway's saved data

### Requirement: Saved data survives restarts and updates
Saved data SHALL survive the app being closed, the phone restarting, and the app being updated to a new build. A new build that changes how data is stored SHALL convert the existing data, not delete it.

#### Scenario: App updated
- **WHEN** a new build of the app is installed over an older one
- **THEN** data saved by the older build is still there and readable
