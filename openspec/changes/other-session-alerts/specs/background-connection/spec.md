## ADDED Requirements

### Requirement: Watch sessions on other devices
While Keep connected is on, the person is signed in and the connection is open, the app SHALL check every Live session's status every 10 seconds, whether or not the app is on screen. It SHALL NOT attach to a session just to watch it.

#### Scenario: Keep connected on
- **WHEN** Keep connected is on and the app is in the background
- **THEN** the app asks the gateway for the list of Live sessions every 10 seconds

#### Scenario: Keep connected off
- **WHEN** Keep connected is off
- **THEN** the app doesn't check sessions it hasn't opened, and raises no alert for them

### Requirement: Alert after 30 seconds of waiting
When a session the phone hasn't opened has been waiting on an Approval or a Question for 30 seconds, the app SHALL alert the person once for that wait. If the session stops waiting within 30 seconds, the app SHALL NOT alert.

#### Scenario: Approval on the laptop, person walks away
- **WHEN** a turn started on the laptop waits on an Approval for 30 seconds
- **THEN** the phone raises a notification for it within the next 10 seconds

#### Scenario: Answered at the laptop in time
- **WHEN** a turn started on the laptop waits on an Approval, and the person answers it on the laptop after 20 seconds
- **THEN** the phone raises no notification

#### Scenario: No finished alert
- **WHEN** a turn started on the laptop finishes
- **THEN** the phone raises no "Hermes finished" notification

### Requirement: Alert with buttons when the gateway allows detaching
When the gateway gives each connection its own subscription, the app SHALL attach to the waiting session and raise the same Approval or Question notification it raises for sessions opened on the phone, with Run and Reject for an Approval. Once the session has no waiting request, the app SHALL detach from it with `session.detach`, unless the session is open on screen. The app SHALL NEVER send `session.close` for a session it is only watching.

#### Scenario: Run from the notification
- **WHEN** the phone raises the Approval notification for a laptop session, and the person taps Run
- **THEN** the gateway runs the command, the notification goes away, and the phone detaches from the session

#### Scenario: Answered at the laptop after the alert
- **WHEN** the phone has raised the notification, and the person then answers on the laptop
- **THEN** the phone removes the notification and detaches

### Requirement: Plain alert when the gateway can't detach
When the gateway can't detach one connection from a session, the app SHALL NOT attach to watched sessions. It SHALL raise a notification titled with the desktop's "Input needed — {session}" wording, with no buttons. Tapping it SHALL open the session. The notification SHALL be removed when the session stops waiting.

#### Scenario: Older gateway
- **WHEN** a laptop session waits for 30 seconds on a gateway without subscriptions
- **THEN** the phone shows "Input needed — {session}" without buttons, and is not attached to the session

#### Scenario: Tap the plain alert
- **WHEN** the person taps the plain notification
- **THEN** the app opens that session and shows its Approval or Question card

#### Scenario: Answered elsewhere
- **WHEN** the session stops waiting while the plain notification is showing
- **THEN** the phone removes the notification at its next check

### Requirement: Keep connected explains the alerts
Keep connected's description in Settings SHALL say that it also alerts the person when a session on another device needs their input.

#### Scenario: Settings
- **WHEN** the person opens Settings
- **THEN** Keep connected's description mentions alerts for sessions on other devices
