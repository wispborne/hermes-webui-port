// Sizes for the compact layout. Material 3's defaults leave less room for a
// transcript and the session list, so the app uses smaller steps.

/** Spacing in dp. Everything is a multiple of the 4 dp step. */
export const space = {
  step: 4,
  /** Between items in a list. */
  listGap: 8,
  /** Around the edge of a screen. */
  screen: 12
} as const

/** The height of a list row, such as a session in the session list. */
export const ROW_HEIGHT = 56

/** Text sizes in sp. Body text is 14 sp. */
export const typeScale = {
  displayLarge: { fontSize: 45, lineHeight: 52 },
  displayMedium: { fontSize: 36, lineHeight: 44 },
  displaySmall: { fontSize: 30, lineHeight: 36 },
  headlineLarge: { fontSize: 26, lineHeight: 32 },
  headlineMedium: { fontSize: 22, lineHeight: 28 },
  headlineSmall: { fontSize: 20, lineHeight: 26 },
  titleLarge: { fontSize: 18, lineHeight: 24 },
  titleMedium: { fontSize: 15, lineHeight: 20 },
  titleSmall: { fontSize: 13, lineHeight: 18 },
  labelLarge: { fontSize: 13, lineHeight: 18 },
  labelMedium: { fontSize: 12, lineHeight: 16 },
  labelSmall: { fontSize: 11, lineHeight: 16 },
  bodyLarge: { fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontSize: 14, lineHeight: 20 },
  bodySmall: { fontSize: 12, lineHeight: 16 }
} as const
