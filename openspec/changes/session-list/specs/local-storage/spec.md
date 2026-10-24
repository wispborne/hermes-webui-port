## ADDED Requirements

### Requirement: Saved session list
The app SHALL save the session list each time it loads it from the gateway, and show the saved list at once when Sessions opens. Sessions the gateway no longer returns SHALL be removed from the saved list. Running and Needs input markers SHALL NOT be saved, because they're only true while connected.

#### Scenario: Open offline
- **WHEN** the person opens the app while the gateway can't be reached
- **THEN** Sessions shows the saved list, with no markers and with the "Can't reach the gateway" banner

#### Scenario: Session deleted elsewhere
- **WHEN** a session was deleted in the web UI, and the phone reloads the list
- **THEN** the session disappears from the phone's saved list
