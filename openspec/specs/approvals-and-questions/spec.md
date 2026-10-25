# approvals-and-questions Specification

## Purpose
How the mobile app shows and answers Approvals and Questions, marks a session Needs input, and removes cards that can no longer be answered.
## Requirements
### Requirement: Approval card
When Hermes asks for an Approval in a session open on the phone, the Session screen SHALL show an Approval card above the message box. The card SHALL show the command, its description, and the choices the gateway offers: Run, Allow this session, Always allow and Reject. Choices the gateway doesn't offer SHALL be hidden.

#### Scenario: Approval arrives
- **WHEN** Hermes asks to run `rm -rf build/` during a turn
- **THEN** an Approval card appears above the message box with the command and the four choices

#### Scenario: Permanent allow not offered
- **WHEN** the gateway says a permanent allow isn't allowed for this command
- **THEN** the card has no Always allow choice

#### Scenario: Several Approvals waiting
- **WHEN** three Approvals are waiting in one session
- **THEN** one card shows, marked "1 of 3", and the next appears after it's answered

### Requirement: Answer an Approval
Tapping a choice SHALL send it to the gateway and remove the card. Always allow SHALL ask for confirmation first.

#### Scenario: Run
- **WHEN** the person taps Run
- **THEN** the card disappears and the turn continues with the command run

#### Scenario: Reject
- **WHEN** the person taps Reject
- **THEN** the card disappears and the command isn't run

#### Scenario: Always allow
- **WHEN** the person taps Always allow
- **THEN** the app asks "Always allow this command?" and sends the choice only if the person confirms

### Requirement: Question card
When Hermes asks a Question in a session open on the phone, the Session screen SHALL show a Question card above the message box. The card SHALL go through the questions one at a time. Each question SHALL accept one of its choices, several choices when it allows that, or free text. The person SHALL be able to skip a question.

#### Scenario: Two questions with choices
- **WHEN** Hermes asks two questions, the first with the choices "main" and "dev"
- **THEN** the card shows the first question with "main" and "dev" buttons, then the second question, and sends both answers after the last one

#### Scenario: Multi-select
- **WHEN** a question allows several choices
- **THEN** the person can pick more than one before going on

#### Scenario: Skip
- **WHEN** the person skips a question
- **THEN** that question is sent as skipped, and the card moves to the next one

#### Scenario: Close
- **WHEN** the person closes the card and confirms
- **THEN** all the questions are cancelled

### Requirement: Needs input
While a session has an Approval or Question card waiting, that session SHALL be marked Needs input, both on its Session screen and in the Sessions list.

#### Scenario: Leave and come back
- **WHEN** an Approval is waiting and the person goes back to Sessions
- **THEN** the session's row shows Needs input, and opening it shows the card again

### Requirement: Cards survive disconnects
An Approval or Question that's still waiting on the gateway SHALL appear again after the app reconnects or reopens the session.

#### Scenario: Phone was asleep
- **WHEN** Hermes asked for an Approval while the phone was locked, and the person opens the app 4 minutes later
- **THEN** the Approval card is shown and can be answered

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

### Requirement: Requests the app can't handle
For requests from Hermes the app doesn't support yet, such as a sudo password, the app SHALL tell the gateway it isn't showing them, in a way that still lets another device answer.

#### Scenario: Sudo prompt with the laptop open
- **WHEN** Hermes asks for a sudo password in a session open on both the phone and the laptop
- **THEN** the laptop can still answer it

#### Scenario: Sudo prompt with only the phone
- **WHEN** Hermes asks for a sudo password and only the phone has the session open
- **THEN** the gateway is told at once that no client is showing it, so the agent doesn't wait out its timeout

