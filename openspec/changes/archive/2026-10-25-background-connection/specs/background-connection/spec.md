## ADDED Requirements

### Requirement: Stay connected while something is happening
When the app leaves the screen while a session opened on the phone has a running turn or Needs input, the app SHALL keep its gateway connection open, with an ongoing notification that says what's happening. It SHALL close the connection and remove that notification 5 minutes after no such session remains.

#### Scenario: Lock the phone mid-turn
- **WHEN** the person sends a message and locks the phone while the turn runs
- **THEN** the connection stays open, and an ongoing notification says Hermes is working

#### Scenario: Turn finishes
- **WHEN** the turn finishes and nothing else is running or Needs input
- **THEN** the ongoing notification and the connection end 5 minutes later

#### Scenario: Nothing happening
- **WHEN** the app leaves the screen and no session opened on the phone is running or Needs input
- **THEN** no ongoing notification appears and the connection closes

### Requirement: Keep connected setting
Settings SHALL have a "Keep connected" switch, off by default. While it's on, the app SHALL keep its gateway connection open at all times, including after the phone restarts.

#### Scenario: Turn on Keep connected
- **WHEN** the person turns Keep connected on
- **THEN** the app asks for the permissions it needs, explaining each first, and the ongoing notification appears

#### Scenario: Phone restarts
- **WHEN** the phone restarts with Keep connected on
- **THEN** the connection starts again without the person opening the app

#### Scenario: Turn off Keep connected
- **WHEN** the person turns Keep connected off and nothing is running or Needs input
- **THEN** the ongoing notification and the connection end

### Requirement: Battery exemption
The first time the app needs to stay connected in the background, it SHALL explain why it needs to run without battery restrictions and ask Android for that exemption. If the person declines, the app SHALL keep working and Settings SHALL note that the connection may drop while the phone is idle.

#### Scenario: Person allows it
- **WHEN** the person allows unrestricted battery use
- **THEN** the connection stays open while the phone is idle and locked

#### Scenario: Person declines
- **WHEN** the person declines
- **THEN** Settings shows that the connection may drop while the phone is idle

### Requirement: Approval notification
While the app is connected and not on screen, an Approval in a session opened on the phone SHALL raise an "Approval needed" notification with the session's name and the command. It SHALL have Run and Reject buttons that answer the Approval without opening the app. The notification SHALL disappear when the Approval no longer needs an answer.

#### Scenario: Run from the notification
- **WHEN** an "Approval needed" notification appears and the person presses Run
- **THEN** the Approval is answered with Run, the notification disappears, and the turn continues

#### Scenario: Answered on the laptop
- **WHEN** the person answers the same Approval on the laptop
- **THEN** the phone's notification disappears once the turn continues

#### Scenario: Tap the notification
- **WHEN** the person taps the notification body
- **THEN** the app opens that session with the Approval card shown

### Requirement: Question notification
While the app is connected and not on screen, a Question in a session opened on the phone SHALL raise an "Input needed" notification with the session's name and the first question. Tapping it SHALL open the session with the Question card shown.

#### Scenario: Question while locked
- **WHEN** Hermes asks a Question while the phone is locked
- **THEN** an "Input needed" notification appears, and tapping it opens the Question card

### Requirement: Finished notification
When a turn in a session opened on the phone ends while the app isn't on screen, the app SHALL raise a "Hermes finished" notification. Tapping it SHALL open the session.

#### Scenario: Turn ends in the background
- **WHEN** a turn finishes while the phone is in a pocket
- **THEN** a "Hermes finished" notification appears

#### Scenario: Session on screen
- **WHEN** a turn finishes while its session is on screen
- **THEN** no notification appears

### Requirement: Reconnect quickly
The app SHALL reconnect at once, without waiting for its retry delay, when the network comes back, when the network changes, or when the app returns to the screen. It SHALL then catch up every open session.

#### Scenario: Tailscale comes back
- **WHEN** Tailscale reconnects after a drop
- **THEN** the app reconnects within a few seconds and shows what happened meanwhile

#### Scenario: Return to the app
- **WHEN** the person opens the app after an hour in the background with the service stopped
- **THEN** the app reconnects at once and the open session catches up
