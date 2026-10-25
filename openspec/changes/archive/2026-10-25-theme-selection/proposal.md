## Why

The app always uses the desktop's default theme, and always follows the phone's light or dark setting. The owner wants to choose, like they can on the desktop: a fixed light or dark mode, another colour theme, or a different accent colour.

## What Changes

- Settings gets an Appearance section with three choices: Color Mode (Light, Dark or System), Theme, and Accent color.
- The themes are the desktop's built-in colour themes from `@hermes/shared/theme-presets`, with the desktop's names and in the desktop's order.
- The accent colours are the desktop's eight swatches, plus Theme default. There is no custom colour.
- An accent is applied the way the desktop applies it, by importing the desktop's accent and recolouring code instead of copying it.
- The choices are saved on the phone only. They're kept after sign-out.
- A choice applies at once, without restarting the app.
- Theme colours written as CSS `color-mix()` are converted to colours Android can draw.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `app-appearance`: colours come from the chosen theme and accent instead of always `nous`. Light or dark follows the phone only when Color Mode is System. New requirements for the Appearance settings and for saving the choices.

## Impact

- Changed: `mobile/src/theme/` (themes built from any preset and accent), `mobile/src/app/_layout.tsx` (reads the saved choices), the Settings screen, `mobile/src/storage/app-settings.ts` (three new settings).
- Changed: `mobile/tsconfig.json` and `mobile/metro.config.js` (a narrow path to four files in `apps/desktop/src/themes/`), `mobile/scripts/export-strings.mjs` (exports the Appearance strings and the theme names).
- Changed: `.github/workflows/mobile.yml` also runs when `apps/desktop/src/themes/**` changes.
- Changed: the app's outline icons become filled ones.
- No change to the web UI or to `apps/`.
