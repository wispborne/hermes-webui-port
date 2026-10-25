# local-storage Specification

## Purpose
What the mobile app saves on the phone for a gateway, and when it deletes it. The rest of this capability's requirements come from mobile-foundation when it's archived.
## Requirements
### Requirement: Sign out wipes saved data
Signing out SHALL delete everything the app saved for that gateway, including the outbox. Only the gateway URL and the username SHALL be kept, to fill in the Sign in screen.

#### Scenario: Sign out with saved sessions
- **WHEN** the person signs out after using the app
- **THEN** no saved sessions, transcripts or outbox messages remain on the phone

#### Scenario: Sign in again
- **WHEN** the person signs in again after signing out
- **THEN** the app starts with no saved data and loads everything from the gateway

### Requirement: Saved session list
The app SHALL save the session list each time it loads it from the gateway, and show the saved list at once when Sessions opens. Sessions the gateway no longer returns SHALL be removed from the saved list. Running and Needs input markers SHALL NOT be saved, because they're only true while connected.

#### Scenario: Open offline
- **WHEN** the person opens the app while the gateway can't be reached
- **THEN** Sessions shows the saved list, with no markers and with the "Can't reach the gateway" banner

#### Scenario: Session deleted elsewhere
- **WHEN** a session was deleted in the web UI, and the phone reloads the list
- **THEN** the session disappears from the phone's saved list

### Requirement: Saved transcripts
The app SHALL save the transcript of every session the person opens. It SHALL keep transcripts for the 50 most recently opened sessions and delete older ones. A deleted transcript SHALL load again from the gateway the next time its session is opened. The app SHALL NOT download transcripts of sessions the person hasn't opened.

#### Scenario: Open a session offline
- **WHEN** the person opens a session they read yesterday, while offline
- **THEN** its saved transcript shows

#### Scenario: Fifty-first session
- **WHEN** the person opens a 51st session
- **THEN** the transcript of the least recently opened session is deleted from the phone

#### Scenario: Session never opened
- **WHEN** the person opens, while offline, a session they have never opened
- **THEN** the screen says the transcript isn't saved on this phone, and loads it once the gateway can be reached

### Requirement: Saved outbox
Outbox messages SHALL be saved as soon as they're written. They SHALL survive the app closing and the phone restarting, and SHALL only be removed when the gateway accepts them or the person cancels or discards them.

#### Scenario: App closed with waiting messages
- **WHEN** the person writes a message offline, closes the app, and opens it later with the gateway reachable
- **THEN** the message is sent

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

