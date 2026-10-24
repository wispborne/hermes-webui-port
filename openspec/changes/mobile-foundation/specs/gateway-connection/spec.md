## ADDED Requirements

### Requirement: Check a gateway
The app SHALL let the person enter a gateway URL and check it. The check SHALL call the gateway's public status endpoint and show the gateway's Hermes version.

#### Scenario: Gateway answers
- **WHEN** the person enters `https://hermes-dashboard.wispborne.com` and the gateway answers
- **THEN** the app shows the gateway's Hermes version, for example "0.22.4"

#### Scenario: URL is not a gateway
- **WHEN** the address answers but isn't a Hermes gateway
- **THEN** the app says the address is not a Hermes gateway

### Requirement: Can't reach the gateway
When the gateway can't be reached, the app SHALL say so in plain words, mention Tailscale, and offer a retry.

#### Scenario: Tailscale is off
- **WHEN** the gateway URL is only reachable over Tailscale and Tailscale is off
- **THEN** the app shows "Can't reach the gateway. Is Tailscale connected?" with a Retry button

### Requirement: Version banner
The app SHALL know which Hermes version it was built for. When the gateway runs a different version, the app SHALL show a banner naming both versions and keep working.

#### Scenario: Gateway is newer
- **WHEN** the app was built for 0.22.4 and the gateway reports 0.23.0
- **THEN** the app shows "Built for Hermes 0.22.4. The gateway runs 0.23.0." and continues

#### Scenario: Versions match
- **WHEN** the gateway reports the version the app was built for
- **THEN** no banner is shown
