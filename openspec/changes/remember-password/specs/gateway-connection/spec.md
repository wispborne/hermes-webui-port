## MODIFIED Requirements

### Requirement: Sign in with a password
The app SHALL sign in to the gateway with a username and password. It SHALL offer to remember the password on the phone, on by default. A remembered password SHALL be kept only in the phone's secure storage (encrypted with a key in the Android Keystore and kept out of backups), for one gateway URL and username, and SHALL NOT be saved anywhere else. Signing out SHALL forget it.

#### Scenario: Correct password
- **WHEN** the person enters the gateway URL, their username and the right password, and taps Sign in
- **THEN** the app is signed in and shows Sessions

#### Scenario: Remember password
- **WHEN** the person signs in with "Remember password on this phone" on
- **THEN** the password is kept in secure storage, and not in the app settings

#### Scenario: Don't remember password
- **WHEN** the person turns "Remember password on this phone" off and signs in
- **THEN** any remembered password is forgotten, and the switch stays off next time

#### Scenario: Sign out
- **WHEN** the person signs out
- **THEN** the remembered password is forgotten, and the next start shows Sign in

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
The app SHALL stay signed in across restarts for as long as the gateway's session lasts. When the gateway refuses the session and a password is remembered for that gateway and username, the app SHALL sign in again by itself, at most once a minute. It SHALL ask the person to sign in again only when that isn't possible.

#### Scenario: App restarted
- **WHEN** the person signed in yesterday and opens the app today
- **THEN** the app goes straight to Sessions without asking to sign in

#### Scenario: Phone restarted
- **WHEN** the phone restarts after the person signed in
- **THEN** the app is still signed in when opened

#### Scenario: Session expired on the gateway, password remembered
- **WHEN** the gateway no longer accepts the session, at start or while the app runs, and the password is remembered
- **THEN** the app signs in again with it and stays on the screen the person was on

#### Scenario: Remembered password refused
- **WHEN** the app signs in again and the gateway says the password is wrong
- **THEN** the phone forgets the password, and Sign in says the saved password didn't work

#### Scenario: Session refused again straight away
- **WHEN** the gateway refuses the session again less than a minute after the app signed in by itself
- **THEN** the app shows Sign in instead of trying again

#### Scenario: Session expired on the gateway, no password remembered
- **WHEN** the gateway no longer accepts the session and no password is remembered
- **THEN** the app shows Sign in with the gateway URL and the username filled in

#### Scenario: Gateway can't be reached at start
- **WHEN** the app starts and the gateway can't be reached
- **THEN** the app shows Sessions with saved data and the "Can't reach the gateway" banner, not Sign in
