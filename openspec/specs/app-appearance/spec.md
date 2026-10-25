# app-appearance Specification

## Purpose
How the mobile app looks: Material 3, compact layouts, the desktop's colours, and light and dark modes.
## Requirements
### Requirement: Material 3 with a compact layout
The app SHALL use Material 3 components and layouts. Spacing, text and list rows SHALL be compact, so that more of a transcript and more sessions fit on screen than with Material 3's default sizes.

#### Scenario: Session rows are compact
- **WHEN** a list of sessions is shown on a phone-sized screen
- **THEN** each row is about 56 dp tall, and the screen has no large header above the list

#### Scenario: Body text size
- **WHEN** a screen shows body text at the phone's default font scale
- **THEN** the text is 14 sp

### Requirement: Hermes colours
The app SHALL take its colours from the desktop app's default theme (`nous`), read from the shared theme palettes. It SHALL NOT keep its own copy of those colours.

#### Scenario: Primary colour matches the desktop
- **WHEN** the app shows a primary button
- **THEN** its colour is the `nous` theme's primary colour

#### Scenario: Desktop colours change upstream
- **WHEN** an upstream sync changes the `nous` palette
- **THEN** the app's colours change in the next build, with no edit to the app

### Requirement: Light and dark follow the phone
The app SHALL use the light palette when the phone is in light mode and the dark palette when it's in dark mode. It SHALL switch while open when the phone's setting changes.

#### Scenario: Phone switches to dark mode
- **WHEN** the phone switches to dark mode while the app is open
- **THEN** the app redraws with the `nous` dark palette without restarting

### Requirement: Desktop wording
UI text SHALL come from the desktop app's English strings wherever the desktop has a string for the same thing. Text the desktop has no string for SHALL use the terms in CONTEXT.md.

#### Scenario: A string the desktop has
- **WHEN** the app shows the title of an Approval notification
- **THEN** the text is the desktop's `notifications.native.approvalTitle` string ("Approval needed")

