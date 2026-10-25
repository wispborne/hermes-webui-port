## Context

The app builds its Material 3 theme from the `nous` palette in `@hermes/shared/theme-presets` (`mobile/src/theme/theme.ts`). `_layout.tsx` picks light or dark from `useColorScheme()`.

The desktop offers more:
- **Color Mode:** Light, Dark or System, with System as the default.
- **Themes:** 12 built-in themes in `apps/desktop/src/themes/presets.ts`. Eleven of them spread a palette from `THEME_PRESET_PALETTES` and add a name, label, description, fonts and terminal colours. The twelfth, Classic Hermes, is built from a skin by desktop-only code.
- **Accent colour:** eight swatches in `apps/desktop/src/themes/accents.ts`. `retintTheme` in `apps/desktop/src/themes/retint.ts` recolours a theme's accent slots from one colour. It shifts the dark palette's accent so it stays readable.

`accents.ts`, `retint.ts`, `color.ts` and `types.ts` in `apps/desktop/src/themes/` import nothing except each other and `@hermes/shared/color`.

The Nous Alt palette writes 10 of its colours as CSS `color-mix(in srgb, <colour> <n>%, <colour or transparent>)`. Android can't draw those, and `@hermes/shared/color`'s `parseColor` returns null for them.

## Goals / Non-Goals

**Goals:**
- Choose Color Mode, Theme and Accent color in Settings, with the desktop's options and words.
- No copy of the desktop's colours, accent swatches or recolouring rules in the app.
- Every theme draws correctly on Android, in both modes.

**Non-Goals:**
- A custom accent colour.
- Following the gateway's skin, or `/skin`.
- Classic Hermes, and themes installed on the desktop or from the VS Code Marketplace.
- Theme fonts. The app keeps the system font.
- Saving the choices on the gateway or sharing them with the desktop.

## Decisions

### Importing the desktop's theme files

Add a narrow path, `@hermes/desktop-themes/*`, mapped to `../apps/desktop/src/themes/*`:
- TypeScript: one `paths` entry in `mobile/tsconfig.json`.
- Metro: `shared-resolution.js` resolves it the same way it resolves `@hermes/shared`, and `watchFolders` gains `../apps/desktop/src/themes`.

The app imports only `accents.ts`, `retint.ts`, `color.ts` and `types.ts`. A test imports all four under the React Native Jest preset, so an upstream change that adds a desktop-only import fails the sync step's mobile tests instead of the build on the phone.

Alternative considered: copying `accentsFor` and `retintTheme` into the app. Rejected because `retint.ts` carries mixing ratios checked against the shipped palettes. A copy would drift from the desktop without anything noticing.

### Theme names and order

`mobile/scripts/export-strings.mjs` already loads desktop code in Node. It also writes `mobile/src/theme/themes.generated.json`. That file lists each entry of `BUILTIN_THEMES` whose name is a key of `THEME_PRESET_PALETTES`, in the desktop's order, with its `name`, `label` and `description`. This leaves out Classic Hermes. The colours still come from `@hermes/shared/theme-presets` at build time. The JSON only adds the words.

### Building a theme

`hermesTheme(scheme)` becomes `hermesTheme({ scheme, themeName, accent })`:
1. Take `THEME_PRESET_PALETTES[themeName]`, falling back to `nous` for a name that no longer exists after an upstream sync.
2. Convert `color-mix()` values (see below).
3. If `accent` is a swatch id other than `nous`, call `retintTheme` with the swatch's colour for the current mode (`accentsFor(scheme === 'dark')`). `nous` and Theme default both mean the theme's own accent, as on the desktop (`resolveAccentPick`).
4. Map the palette onto Material 3 roles as today.

### `color-mix()`

`mobile/src/theme/css-color.ts` turns `color-mix(in srgb, A p%, B)` into a colour Android accepts:
- When B is a colour, it mixes in sRGB with `mix` from `@hermes/shared/color` and returns a hex.
- When B is `transparent`, it returns `rgba(r, g, b, p/100)`.

Any other value is passed through unchanged. A test checks that every colour slot of every theme, in both modes and with every accent, is a hex or `rgba()` value.

### The accent stays when the theme changes

The phone saves the accent on its own, and applies it to whichever theme is chosen. Theme default uses each theme's own accent.

The desktop works differently. It saves an accent as a new user theme based on the current one, so picking another theme drops it. The phone has no user themes, and keeping the accent is what a person expects from a separate Accent color setting.

### Saving

Three new keys in `AppSettings`:
- `colorMode`: `'light' | 'dark' | 'system'`
- `themeName`: a string
- `accent`: a swatch id, or `null` for Theme default

They go in the app's settings store, not in a gateway's database, so sign-out keeps them. Defaults: System, `nous`, Theme default. Those match today's look, so nothing changes until the person picks something.

A nanostore, `$appearance`, holds the three values. `_layout.tsx` reads it together with `useColorScheme()` and rebuilds the Paper and navigation themes when either changes.

### Settings

A new Appearance section above Keep connected, with the desktop's strings:
- **Color Mode** (`settings.appearance.colorMode`, with `colorModeDesc` as its description): a three-way segmented button labelled from `settings.modeOptions.*.label`.
- **Theme** (`settings.appearance.themeTitle`): a row showing the current theme's label. It opens a list of the themes. Each row shows the label, the description, and four colour dots (background, card, primary, foreground) drawn in the current mode. The current theme is checked.
- **Accent color** (`assistant.themePicker.accent`): a row of nine circles, Theme default (`assistant.themePicker.themeAccent`) first, then the eight swatches. Each has the swatch's name as its accessibility label. The chosen one has a ring.

Picking any of these applies it straight away. `export-strings.mjs` gains the `settings.appearance`, `settings.modeOptions` and `assistant.themePicker` prefixes.

## Risks / Trade-offs

- [An upstream change gives one of the four imported files a desktop-only import] → The import test fails in the sync step. The fix is a small shim, or copying that one function, noted in this design.
- [A new upstream palette uses another CSS colour form, such as `oklch()`] → The every-slot test fails in the sync step and names the slot.
- [`retintTheme` changes shape upstream] → The type check fails in the sync step.
- [A theme looks wrong on Material 3 roles it wasn't made for] → The emulator screenshots cover every theme in both modes before the owner checks on the phone.
