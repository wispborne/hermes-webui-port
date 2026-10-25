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

