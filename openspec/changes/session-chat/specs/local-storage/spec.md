## ADDED Requirements

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
