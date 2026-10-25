## ADDED Requirements

### Requirement: Sign out wipes saved data
Signing out SHALL delete everything the app saved for that gateway, including the outbox. Only the gateway URL and the username SHALL be kept, to fill in the Sign in screen.

#### Scenario: Sign out with saved sessions
- **WHEN** the person signs out after using the app
- **THEN** no saved sessions, transcripts or outbox messages remain on the phone

#### Scenario: Sign in again
- **WHEN** the person signs in again after signing out
- **THEN** the app starts with no saved data and loads everything from the gateway
