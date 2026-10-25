# session-chat Specification

## Purpose
The mobile app's Session screen: opening and starting sessions, sending, streamed replies, Stop, the outbox, and catching up after a reconnect.
## Requirements
### Requirement: Open a session
Tapping a session SHALL open its Session screen. The saved transcript, if any, SHALL show at once. The app SHALL then load the latest messages from the gateway and attach to the session. If a turn is running, the reply in progress SHALL appear and keep streaming.

#### Scenario: Open a saved session
- **WHEN** the person taps a session they opened before
- **THEN** its saved transcript shows at once, and updates when the gateway answers

#### Scenario: Open a session with a running turn
- **WHEN** the person opens a session whose turn is running, for example one started on the laptop
- **THEN** the reply so far appears and continues to stream

#### Scenario: Long session
- **WHEN** a session has more messages than the first load
- **THEN** a "Show earlier" control loads older messages above, without moving what the person is reading

### Requirement: Start a session
The person SHALL be able to start a new session and send its first message.

#### Scenario: First message in a new session
- **WHEN** the person taps the new session button, writes a message and sends it
- **THEN** the session is created on the gateway, the message is sent, and the reply streams in

### Requirement: Send a message
The message box SHALL send the text to the session. The person's message SHALL appear at once. If a turn is already running, the message SHALL be queued behind it and shown as queued.

#### Scenario: Send while idle
- **WHEN** the person sends a message and no turn is running
- **THEN** their message appears, and Hermes's reply starts streaming

#### Scenario: Send while a turn runs
- **WHEN** the person sends a message while a turn is running
- **THEN** the message shows as queued, and is sent to Hermes when the running turn ends

### Requirement: Streamed replies
Hermes's reply SHALL appear as it's written. It SHALL show Markdown formatting and code blocks with syntax highlighting. Text Hermes writes between tool calls SHALL appear as its own block.

#### Scenario: Reply with code
- **WHEN** Hermes replies with text and a code block
- **THEN** the text streams in, and the code block shows highlighted, scrolls sideways when wide, and has a copy button

#### Scenario: Turn fails
- **WHEN** a turn ends with an error
- **THEN** the reply shows the error with the desktop's "Turn failed" wording

### Requirement: Tool activity
Each tool call SHALL show as a compact row with the tool's name and a short summary, and whether it's running or done. Tapping the row SHALL show its arguments and result. A diff SHALL show as monospace text.

#### Scenario: Tool runs
- **WHEN** Hermes calls a tool during a turn
- **THEN** a row appears with the tool name and a running state, which changes to done with a summary when the tool finishes

#### Scenario: Expand a tool row
- **WHEN** the person taps a finished tool row
- **THEN** it expands to show the arguments and the result

### Requirement: Reasoning
When the model's reasoning is available, it SHALL show as a collapsed "Reasoning" section on the reply, which the person can open.

#### Scenario: Reply with reasoning
- **WHEN** the model streams reasoning before its answer
- **THEN** the reply has a collapsed Reasoning section that opens to show it

### Requirement: Stop
While a turn runs, the message box's Send button SHALL become Stop. Tapping Stop SHALL stop the turn.

#### Scenario: Stop a running turn
- **WHEN** the person taps Stop during a turn
- **THEN** the turn stops, the reply so far stays, and the button goes back to Send

### Requirement: Outbox
When the gateway can't be reached, sending SHALL put the message in the outbox instead of failing. Outbox messages SHALL show in the transcript as "Waiting to send" and SHALL be sent in order when the gateway can be reached again. The person SHALL be able to cancel an outbox message before it's sent. A message that has waited more than 24 hours SHALL ask before it's sent.

#### Scenario: Send while offline
- **WHEN** the person sends a message while Tailscale is off
- **THEN** the message shows as "Waiting to send"

#### Scenario: Reconnect sends the outbox
- **WHEN** the gateway becomes reachable with two messages waiting in the same session
- **THEN** both are sent in the order they were written, and their replies stream in

#### Scenario: New session started offline
- **WHEN** the person starts a new session and sends its first message while offline
- **THEN** on reconnect the session is created on the gateway and the message is sent

#### Scenario: Cancel a waiting message
- **WHEN** the person cancels a "Waiting to send" message
- **THEN** it's removed and never sent

#### Scenario: Old waiting message
- **WHEN** a message has waited more than 24 hours and the gateway becomes reachable
- **THEN** it isn't sent until the person chooses "Send now", and "Discard" removes it

#### Scenario: Connection drops while sending
- **WHEN** the connection drops just after a message was sent but before the gateway confirmed it
- **THEN** after reconnecting, the message appears in the session exactly once

### Requirement: Catch up after a reconnect
After the connection drops and reconnects, an open session SHALL show everything that happened while disconnected, without the person doing anything.

#### Scenario: Reply finished while disconnected
- **WHEN** a reply was streaming, the connection dropped for a minute, and the reply finished meanwhile
- **THEN** after reconnecting, the full reply and its tool rows are shown

#### Scenario: Gateway restarted
- **WHEN** the gateway restarted while the phone was disconnected
- **THEN** after reconnecting, the open session reloads from the gateway

