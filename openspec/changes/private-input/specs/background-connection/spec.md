## ADDED Requirements

### Requirement: Private input notification
While the app is connected and not on screen, a Private input in a session the phone is attached to SHALL raise an "Input needed" notification with the session's name and no buttons. Its text SHALL never include anything the person typed. Tapping it SHALL open the session with the Private input card shown. The notification SHALL be removed when the card is removed.

#### Scenario: Sudo password while locked
- **WHEN** Hermes asks for a sudo password while the phone is locked
- **THEN** an "Input needed" notification appears, and tapping it opens the session with the sudo card

#### Scenario: Session on another device
- **WHEN** Keep connected is on, the gateway allows detaching, and a turn started on the laptop has waited on a sudo password for 30 seconds
- **THEN** the phone attaches, raises the "Input needed" notification, and detaches only once the request is settled

#### Scenario: Answered on the laptop
- **WHEN** the person types the sudo password on the laptop
- **THEN** the phone's notification is removed once the turn continues
