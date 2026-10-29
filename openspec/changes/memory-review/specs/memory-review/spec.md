## ADDED Requirements

### Requirement: Open Memory review
The Sessions screen SHALL have a Memory review button in its top bar. While pending memories wait, the button SHALL show how many. The count SHALL update when Sessions opens and every minute while Sessions is on screen and the gateway is connected.

#### Scenario: Pending memories wait
- **WHEN** the gateway holds three pending memories and the person opens Sessions
- **THEN** the Memory review button shows 3

#### Scenario: None wait
- **WHEN** no pending memories wait
- **THEN** the button shows no count

#### Scenario: Open the screen
- **WHEN** the person taps the Memory review button
- **THEN** the Memory review screen opens

### Requirement: List pending memories
The Memory review screen SHALL list each pending memory, oldest first. Each SHALL show what it does (Add, Edit, Remove, Replace or Several changes), where it goes (Memory or User profile), "Background review" when Hermes suggested it on its own, and its text. For an edit or a removal it SHALL show the full memory that would change. When the gateway sent only the start of the text, the screen SHALL say so.

#### Scenario: An added memory
- **WHEN** Hermes holds a memory "Prefers short answers"
- **THEN** a card shows Add, Memory, and "Prefers short answers"

#### Scenario: A removal suggested by background review
- **WHEN** background review suggests removing a memory
- **THEN** the card shows Remove, Background review, and the full memory under "Removes this memory"

#### Scenario: Text cut short
- **WHEN** a held memory is longer than the gateway sends
- **THEN** the card ends the text with "…" and says the end may be missing

#### Scenario: Nothing waits
- **WHEN** no pending memories wait
- **THEN** the screen says "No pending memories", with a line that depends on whether approval is on

#### Scenario: A reply the app can't read
- **WHEN** the gateway's answer isn't in the expected format
- **THEN** the screen shows the answer as it is

### Requirement: Approve and reject
Each card SHALL have Approve and Reject. When more than one pending memory waits, the screen SHALL offer Approve all and Reject all, each after a confirmation. After an action the screen SHALL show the gateway's reply at the top and reload the list. Buttons SHALL be disabled while an action runs and while the gateway isn't connected.

#### Scenario: Approve an edit
- **WHEN** the person taps Approve on an edit
- **THEN** the card goes away, and the reply shows the memory as it was before the edit

#### Scenario: Reject
- **WHEN** the person taps Reject on a card
- **THEN** the card goes away and nothing is saved

#### Scenario: Approve all
- **WHEN** three wait and the person taps Approve all and confirms
- **THEN** all three are saved and the list is empty

#### Scenario: Offline
- **WHEN** the gateway can't be reached
- **THEN** the last list stays on screen and the buttons are disabled

### Requirement: Approval switch
The screen SHALL show the "Ask before saving memories" switch with the gateway's current `memory.write_approval` setting. Changing it SHALL change the setting on the gateway.

#### Scenario: Turn approval off
- **WHEN** the person turns the switch off
- **THEN** the gateway's `memory.write_approval` is off, and the switch stays off after a reload
