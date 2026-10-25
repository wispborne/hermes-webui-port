# gateway-connection Specification

## Purpose
How the mobile app signs in to a gateway, stays signed in, keeps its WebSocket open, and signs out. The rest of this capability's requirements come from mobile-foundation when it's archived.
## Requirements
### Requirement: Sign in with a password
The app SHALL sign in to the gateway with a username and password. It SHALL NOT save the password anywhere.

#### Scenario: Correct password
- **WHEN** the person enters the gateway URL, their username and the right password, and taps Sign in
- **THEN** the app is signed in and shows Sessions

#### Scenario: Wrong password
- **WHEN** the password is wrong
- **THEN** the app says the username or password is wrong, and stays on Sign in

#### Scenario: Too many attempts
- **WHEN** the gateway refuses because of too many attempts
- **THEN** the app says to wait and try again shortly

#### Scenario: No password sign-in on the gateway
- **WHEN** the gateway offers no password sign-in
- **THEN** the app says this gateway's sign-in method isn't supported yet

### Requirement: Stay signed in
The app SHALL stay signed in across restarts for as long as the gateway's session lasts. It SHALL ask the person to sign in again only when the gateway refuses the session.

#### Scenario: App restarted
- **WHEN** the person signed in yesterday and opens the app today
- **THEN** the app goes straight to Sessions without asking to sign in

#### Scenario: Phone restarted
- **WHEN** the phone restarts after the person signed in
- **THEN** the app is still signed in when opened

#### Scenario: Session expired on the gateway
- **WHEN** the gateway no longer accepts the session
- **THEN** the app shows Sign in with the gateway URL and the username filled in

#### Scenario: Gateway can't be reached at start
- **WHEN** the app starts and the gateway can't be reached
- **THEN** the app shows Sessions with saved data and the "Can't reach the gateway" banner, not Sign in

### Requirement: Live connection
While signed in and the gateway can be reached, the app SHALL keep a WebSocket connection to the gateway. It SHALL reconnect on its own after the connection drops, waiting longer between attempts the more attempts fail.

#### Scenario: Connection drops
- **WHEN** the WebSocket closes while the app is on screen
- **THEN** the app reconnects without the person doing anything

#### Scenario: Ready to answer the gateway
- **WHEN** a WebSocket connection opens
- **THEN** the app tells the gateway it can answer Approvals and Questions before it sends anything else

### Requirement: Settings
The app SHALL have a Settings screen that shows the gateway URL, who is signed in, the app's version, the Hermes version it was built for, and the gateway's Hermes version. It SHALL offer Sign out.

#### Scenario: Open Settings
- **WHEN** the person opens Settings
- **THEN** the screen shows the gateway URL, the signed-in username and the three versions

### Requirement: Sign out
Signing out SHALL end the session on the gateway when it can be reached, clear the session on the phone either way, and return to Sign in with the gateway URL kept.

#### Scenario: Sign out while online
- **WHEN** the person taps Sign out and the gateway can be reached
- **THEN** the gateway ends the session, and the app shows Sign in

#### Scenario: Sign out while offline
- **WHEN** the person taps Sign out and the gateway can't be reached
- **THEN** the app still clears the session on the phone and shows Sign in

