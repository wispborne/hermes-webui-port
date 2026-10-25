# session-list Specification

## Purpose
The mobile app's Sessions screen: recent sessions, their markers, staying current, search, and starting a new session.
## Requirements
### Requirement: Recent sessions
The Sessions screen SHALL list the gateway's saved sessions, most recently active first. It SHALL leave out cron sessions, archived sessions and hidden sessions. Each row SHALL show the title, a preview of the conversation, and how long ago it was last active.

#### Scenario: Open Sessions
- **WHEN** the person opens the app while signed in
- **THEN** Sessions lists their recent sessions, newest first, with title, preview and last-active time

#### Scenario: Cron sessions are left out
- **WHEN** the gateway has sessions started by cron jobs
- **THEN** they are not in the list

#### Scenario: Session without a title
- **WHEN** a session has no title yet
- **THEN** the row shows the start of its preview in place of the title

#### Scenario: Scroll past the first page
- **WHEN** the person scrolls to the end of the list and the gateway has more sessions
- **THEN** the next sessions load below

### Requirement: Running and Needs input markers
Each row SHALL show whether its session has a running turn or Needs input. This SHALL include sessions open on other devices.

#### Scenario: Turn running on the laptop
- **WHEN** a session started in the web UI on the laptop is running a turn
- **THEN** its row on the phone shows the running marker within about 10 seconds

#### Scenario: Approval waiting
- **WHEN** a session's turn is waiting on an Approval or a Question
- **THEN** its row shows the Needs input marker

#### Scenario: Turn ends
- **WHEN** a session's turn finishes
- **THEN** its marker disappears

### Requirement: Stays current
While the Sessions screen is open and connected, the list SHALL update on its own when sessions are added, renamed or deleted on the gateway. The person SHALL also be able to pull down to refresh.

#### Scenario: Session started on the laptop
- **WHEN** a new session is started in the web UI while Sessions is open on the phone
- **THEN** it appears at the top of the list without the person doing anything

#### Scenario: Pull to refresh
- **WHEN** the person pulls the list down
- **THEN** the list and the markers reload from the gateway

### Requirement: Search
The Sessions screen SHALL have a search bar. While connected, it SHALL search the gateway's sessions. While offline, it SHALL search saved sessions only, and say so.

#### Scenario: Search online
- **WHEN** the person types "docker" while connected
- **THEN** the list shows the gateway's sessions that match "docker"

#### Scenario: Search offline
- **WHEN** the person searches while the gateway can't be reached
- **THEN** the list shows saved sessions whose title or preview matches, with a note that only saved sessions were searched

### Requirement: Start a new session
The Sessions screen SHALL have a button that starts a new session.

#### Scenario: New session
- **WHEN** the person taps the new session button
- **THEN** the app opens an empty Session screen ready for the first message

