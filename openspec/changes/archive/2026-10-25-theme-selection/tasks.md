## 1. Imports and words

- [x] 1.1 Add the `@hermes/desktop-themes/*` path to `mobile/tsconfig.json`, `shared-resolution.js` and Metro's `watchFolders`
- [x] 1.2 Test that imports `accents.ts`, `retint.ts`, `color.ts` and `types.ts` under the React Native Jest preset
- [x] 1.3 Extend `export-strings.mjs`: the `settings.appearance`, `settings.modeOptions` and `assistant.themePicker` prefixes, and `mobile/src/theme/themes.generated.json` (name, label, description, desktop order, palette themes only)

## 2. Building themes

- [x] 2.1 Write `mobile/src/theme/css-color.ts` for `color-mix(in srgb, …)` with a colour or `transparent`
- [x] 2.2 Change `hermesTheme` to take scheme, theme name and accent, falling back to `nous`, and recolour with `retintTheme`
- [x] 2.3 Tests: every slot of every theme, in both modes and with every accent, is a hex or `rgba()` value; Theme default and `nous` leave a theme unchanged; unknown theme name falls back to `nous`

## 3. Saving

- [x] 3.1 Add `colorMode`, `themeName` and `accent` to `AppSettings`, with the defaults
- [x] 3.2 Add the `$appearance` store, loaded at start and saved on change
- [x] 3.3 `_layout.tsx` builds the Paper, navigation and status bar themes from `$appearance` and `useColorScheme()`
- [x] 3.4 Tests: defaults, saved values come back after a reload, sign-out keeps them, System follows the phone and Light or Dark doesn't

## 4. Settings

- [x] 4.1 Add the Appearance section above Keep connected: Color Mode segmented button, Theme row, Accent color circles
- [x] 4.2 Build the theme list screen: label, description, four colour dots in the current mode, check on the current theme
- [x] 4.3 Tests: picking each choice updates `$appearance` and the drawn colours

## 5. Done

- [x] 5.1 Type check and tests pass
- [x] 5.2 Emulator screenshots: Appearance section in light and dark, the theme list, three themes in both modes, a theme with a swatch accent
- [x] 5.3 The owner picks a theme, an accent and a fixed mode on their phone, restarts the app, and checks they're kept

## Notes

- The desktop's swatch list includes Nous blue. The desktop treats it as the theme's own accent, so the phone doesn't show it as a separate swatch. Theme default covers it.
- `metro.config.js` now watches `apps/desktop/src/themes`, so a Metro started before this change has to be restarted.
- At the owner's request, the app's outline icons were changed to filled ones, and the spec has a Filled icons requirement.
- The screenshots were taken on the emulator signed in to the owner's gateway. They're cropped to the Appearance section and the theme list, so no gateway address, username or session title is in them.
