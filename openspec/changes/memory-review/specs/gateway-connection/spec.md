## MODIFIED Requirements

### Requirement: Settings
The app SHALL have a Settings screen laid out like the web UI's settings dialog: a list of sections, each opening its own page, in the dialog's order and with its names. The phone SHALL show the sections it has: Appearance, Memory & Context, Notifications, Gateways and About. Gateways SHALL show the gateway URL and who is signed in, and offer Sign out. About SHALL show the app's version, the Hermes version it was built for, and the gateway's Hermes version.

#### Scenario: Open Settings
- **WHEN** the person opens Settings
- **THEN** the screen lists Appearance, Memory & Context, Notifications, Gateways and About, in that order

#### Scenario: Gateways
- **WHEN** the person opens Settings ▸ Gateways
- **THEN** the page shows the gateway URL and the signed-in username, and offers Sign out

#### Scenario: About
- **WHEN** the person opens Settings ▸ About
- **THEN** the page shows the app's version, the Hermes version it was built for, and the gateway's Hermes version
