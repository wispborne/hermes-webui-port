## MODIFIED Requirements

### Requirement: Hermes colours
The app SHALL take its colours from the chosen theme, read from the shared theme palettes. The default theme SHALL be the desktop's default (`nous`). It SHALL NOT keep its own copy of the palettes, the accent swatches, or the rules for recolouring a theme from an accent.

#### Scenario: Primary colour matches the desktop
- **WHEN** the app shows a primary button with the default theme and accent
- **THEN** its colour is the `nous` theme's primary colour

#### Scenario: Desktop colours change upstream
- **WHEN** an upstream sync changes a palette
- **THEN** the app's colours for that theme change in the next build, with no edit to the app

#### Scenario: A saved theme no longer exists
- **WHEN** the saved theme is missing from the palettes after an upstream sync
- **THEN** the app uses `nous`

#### Scenario: A colour Android can't draw
- **WHEN** a palette writes a colour as CSS `color-mix()`
- **THEN** the app draws the mixed colour the desktop would show

### Requirement: Light and dark follow the phone
When Color Mode is System, the app SHALL use the light palette when the phone is in light mode and the dark palette when it's in dark mode. It SHALL switch while open when the phone's setting changes. When Color Mode is Light or Dark, the app SHALL use that palette whatever the phone's setting.

#### Scenario: Phone switches to dark mode
- **WHEN** the phone switches to dark mode while the app is open and Color Mode is System
- **THEN** the app redraws with the chosen theme's dark palette without restarting

#### Scenario: Fixed mode ignores the phone
- **WHEN** Color Mode is Light and the phone switches to dark mode
- **THEN** the app stays light

## ADDED Requirements

### Requirement: Appearance settings
Settings SHALL have an Appearance section with three choices, using the desktop's wording:
- **Color Mode**: Light, Dark or System.
- **Theme**: the desktop's built-in themes that come from the shared palettes, in the desktop's order, with the desktop's names.
- **Accent color**: Theme default, then the desktop's accent swatches. There is no custom colour.

A choice SHALL apply at once, without restarting the app.

#### Scenario: Pick a theme
- **WHEN** the person opens Theme and picks Catppuccin
- **THEN** the whole app, including the status bar and navigation, redraws with the Catppuccin palette for the current mode

#### Scenario: Theme list shows colours
- **WHEN** the person opens Theme
- **THEN** each theme shows its name, its description and a few of its colours in the current mode, and the current theme is checked

#### Scenario: Pick an accent
- **WHEN** the person picks Barbie pink
- **THEN** the theme's accent colours change to pink, the dark palette uses a readable shade of it, and the rest of the theme stays the same

#### Scenario: Accent kept when the theme changes
- **WHEN** the person has picked Barbie pink and then picks another theme
- **THEN** the new theme is shown with the pink accent

#### Scenario: Theme default
- **WHEN** the person picks Theme default
- **THEN** each theme uses its own accent

### Requirement: Appearance saved on the phone
The app SHALL save Color Mode, Theme and Accent color on the phone, separately from any gateway's data. Signing out SHALL keep them. They SHALL NOT be sent to the gateway. Until the person changes them, they SHALL be System, `nous` and Theme default.

#### Scenario: Restart
- **WHEN** the person picks Dark and Everforest, then closes and reopens the app
- **THEN** the app opens in Everforest dark

#### Scenario: Sign out
- **WHEN** the person signs out and signs in again
- **THEN** their Color Mode, Theme and Accent color are unchanged
