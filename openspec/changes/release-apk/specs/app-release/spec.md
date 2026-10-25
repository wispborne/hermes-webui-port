## ADDED Requirements

### Requirement: Releases from a version bump
A release SHALL be made when the version in `mobile/app.json` on main has no `mobile-v<version>` tag yet. A release SHALL be built, signed, tagged `mobile-v<version>` and published as a Gitea release with the APK attached, with no other step from the owner. Releases SHALL be made on Gitea only. Pushes that don't change the version SHALL NOT make a release.

#### Scenario: The owner bumps the version
- **WHEN** a push to main changes the version in `mobile/app.json` from 0.1.0 to 0.2.0
- **THEN** a Gitea release titled "Hermes mobile 0.2.0" appears, tagged `mobile-v0.2.0`, with `hermes-0.2.0.apk` attached

#### Scenario: A change without a bump
- **WHEN** a push to main changes `mobile/` but not the version
- **THEN** no release or tag is made

#### Scenario: Checks fail
- **WHEN** the version is bumped but the type check or a test fails
- **THEN** no release or tag is made, and the next push with that version tries again

#### Scenario: The GitHub mirror
- **WHEN** main is mirrored to GitHub
- **THEN** no release or tag is made there

### Requirement: Release notes
A release's notes SHALL list the subjects of the commits that changed `mobile/` since the last `mobile-v` tag, oldest first.

#### Scenario: Second release
- **WHEN** 0.3.0 is released after 0.2.0
- **THEN** its notes list the commits that changed `mobile/` between `mobile-v0.2.0` and the release commit

### Requirement: Android version number
The app's Android `versionCode` SHALL be worked out from the version as `major * 10000 + minor * 100 + patch`. A version whose parts aren't whole numbers from 0 to 99 SHALL fail the build.

#### Scenario: Version 1.2.3
- **WHEN** the version is 1.2.3
- **THEN** the APK's `versionCode` is 10203

#### Scenario: Version out of range
- **WHEN** the version is 0.100.0
- **THEN** the build fails and says which part is out of range

### Requirement: One signing key
Every release APK SHALL be signed with the same release key, kept as Gitea Actions secrets. A release SHALL NOT be published if its APK is signed with the debug key. The key SHALL NOT be committed to the repository.

#### Scenario: Update over the last release
- **WHEN** the owner installs a new release over the previous one
- **THEN** Android installs it as an update and the app keeps what it saved

#### Scenario: Secrets missing
- **WHEN** the signing secrets aren't set
- **THEN** the workflow fails before tagging, and no release is made

### Requirement: Development build beside the release
The development build SHALL have the app ID `com.wispborne.hermes.dev` and the name "Hermes Dev". The release SHALL have the app ID `com.wispborne.hermes` and the name "Hermes". Both SHALL install on the same phone at once.

#### Scenario: Both installed
- **WHEN** the owner installs a release and runs `npm run android`
- **THEN** the phone has both "Hermes" and "Hermes Dev", each with its own sign-in and saved data

### Requirement: Release works with http gateways
A release build SHALL reach a gateway whose address starts with `http://`, as a development build does.

#### Scenario: Gateway over plain http
- **WHEN** the owner signs in to an `http://` gateway address in the release app
- **THEN** the app reaches the gateway, the same as in the development build

### Requirement: Install with Obtainium
The mobile README SHALL explain how to add the app to Obtainium from the Gitea releases. That includes the title filter that skips the web UI's releases.

#### Scenario: Obtainium finds updates
- **WHEN** Obtainium is set up as the README says and a new mobile release is published
- **THEN** Obtainium offers the new APK and ignores `ui-*` releases
