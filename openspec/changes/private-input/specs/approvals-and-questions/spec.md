## ADDED Requirements

### Requirement: Private input card
When Hermes asks for a sudo password, a secret value, a password manager's master password, a login to save, or a verification code in a session open on the phone, the Session screen SHALL show a Private input card above the message box. The card SHALL use the desktop's title, fields and buttons for that request. For a sudo password, the card SHALL show the command it's for, or say that Hermes didn't provide it.

#### Scenario: Sudo password
- **WHEN** Hermes needs a sudo password to run `apt-get install ripgrep`
- **THEN** a card titled "Administrator password" appears above the message box, with the command, a hidden password field, Cancel and Send

#### Scenario: Secret value
- **WHEN** a skill asks for `OPENWEATHER_API_KEY`
- **THEN** a card titled `OPENWEATHER_API_KEY` appears, with the skill's prompt and a hidden value field

#### Scenario: Verification code
- **WHEN** a site Hermes is signing in to asks for a one-time code
- **THEN** a card titled "Verification code for {site}" appears, with a code field, Skip and Enter code

#### Scenario: Several waiting
- **WHEN** two Private inputs are waiting in one session
- **THEN** one card shows, marked "1 of 2", and the next appears after it's answered

#### Scenario: Message box
- **WHEN** a Private input card is shown and the person types in the message box
- **THEN** the text stays in the message box and doesn't fill the card

### Requirement: Answer a Private input
Send SHALL send what the person typed to the gateway and remove the card. The card's cancel button (Cancel, Keep locked, Don't save or Skip) SHALL send an empty answer and remove the card. Hidden fields SHALL have a button that shows what was typed.

#### Scenario: Send a sudo password
- **WHEN** the person types the password and taps Send
- **THEN** the card disappears and the command runs

#### Scenario: Cancel
- **WHEN** the person taps Cancel on a sudo card
- **THEN** the card disappears, and the command isn't run

#### Scenario: Save a login
- **WHEN** the person enters an email and a password and taps Save & sign in
- **THEN** the gateway gets both, and the card disappears

#### Scenario: Offline
- **WHEN** the connection drops while the person is typing a password
- **THEN** Send is disabled, the typed text stays, and Send works again once the connection is back and the request is still waiting

#### Scenario: Show the password
- **WHEN** the person taps the eye button in a password field
- **THEN** the typed password is shown, until they tap it again or the card goes away

### Requirement: What's typed stays off the phone
The app SHALL NOT save what the person types into a Private input card. It SHALL NOT write it to saved data, the Outbox, the transcript, a notification or the log. It SHALL clear the field when the answer is sent and when the card is removed.

#### Scenario: After sending
- **WHEN** the person sends a sudo password and then closes and reopens the app
- **THEN** the password isn't in any saved data on the phone

#### Scenario: Card removed while typing
- **WHEN** the person has typed part of a password and the request times out
- **THEN** the card and what was typed are gone

## MODIFIED Requirements

### Requirement: Needs input
While a session has an Approval, Question or Private input card waiting, that session SHALL be marked Needs input, both on its Session screen and in the Sessions list.

#### Scenario: Leave and come back
- **WHEN** an Approval is waiting and the person goes back to Sessions
- **THEN** the session's row shows Needs input, and opening it shows the card again

#### Scenario: Private input waiting
- **WHEN** a sudo password is waiting and the person goes back to Sessions
- **THEN** the session's row shows Needs input

### Requirement: Cards survive disconnects
An Approval, Question or Private input that's still waiting on the gateway SHALL appear again after the app reconnects or reopens the session.

#### Scenario: Phone was asleep
- **WHEN** Hermes asked for an Approval while the phone was locked, and the person opens the app 4 minutes later
- **THEN** the Approval card is shown and can be answered

#### Scenario: App restarted
- **WHEN** a secret value is waiting, and the app is closed and opened again within the gateway's timeout
- **THEN** the Private input card is shown again, with an empty field

### Requirement: Cards that can't be answered any more
The app SHALL remove a card when its request is answered on another device, cancelled, or timed out. A timed-out Approval SHALL leave the desktop's timed-out note in the transcript.

#### Scenario: Answered on the laptop
- **WHEN** the same Approval is shown on the phone and the laptop, and the person approves it on the laptop
- **THEN** the phone's card disappears once the turn continues

#### Scenario: Timed out
- **WHEN** an Approval is not answered within the gateway's timeout
- **THEN** the card disappears, and the transcript shows "Approval timed out — the command was not run."

#### Scenario: Turn stopped
- **WHEN** the person taps Stop while an Approval is waiting
- **THEN** the card disappears

#### Scenario: Sudo password typed on the laptop
- **WHEN** the same sudo card is shown on the phone and the laptop, and the person types the password on the laptop
- **THEN** the phone's card disappears once the turn continues

#### Scenario: Private input timed out
- **WHEN** a sudo password isn't sent within the gateway's 120 seconds
- **THEN** the card disappears, and no note is added

### Requirement: Requests the app can't handle
For requests from Hermes the app doesn't show, such as a request to read the desktop's terminal, the app SHALL tell the gateway it isn't showing them, in a way that still lets another device answer.

#### Scenario: Desktop-only request with the laptop open
- **WHEN** Hermes asks to read the desktop's terminal in a session open on both the phone and the laptop
- **THEN** the laptop can still answer it

#### Scenario: Desktop-only request with only the phone
- **WHEN** Hermes asks to read the desktop's terminal and only the phone has the session open
- **THEN** the gateway is told at once that no client is showing it, so the agent doesn't wait out its timeout
