import { useStore } from '@nanostores/react'
import { accentsFor } from '@hermes/desktop-themes/accents'
import { router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { Icon, List, SegmentedButtons } from 'react-native-paper'

import { t } from '@/i18n/t'
import type { ColorMode } from '@/storage/app-settings'
import { $appearance, setAppearance } from '@/store/appearance'
import { space } from '@/theme/compact'
import { hermesPalette } from '@/theme/theme'
import themes from '@/theme/themes.generated.json'
import { useHermesTheme } from '@/theme/use-hermes-theme'

const MODES: ColorMode[] = ['light', 'dark', 'system']

const SWATCH_SIZE = 28

/** Settings' Appearance section: Color Mode, Theme and Accent color. Each choice applies at once. */
export function AppearanceSettings() {
  const { accent, colorMode, themeName } = useStore($appearance)
  const { colors, dark } = useHermesTheme()
  const scheme = dark ? 'dark' : 'light'
  const themeLabel = themes.find(theme => theme.name === themeName)?.label ?? themes[0]!.label
  const ownAccent = hermesPalette(scheme, { themeName }).primary

  const swatches = [
    { id: null, name: t('assistant.themePicker.themeAccent'), hex: ownAccent },
    // Nous blue is the default theme's own accent, so the desktop treats it as Theme default.
    ...accentsFor(dark).filter(swatch => swatch.id !== 'nous')
  ]

  return (
    <List.Section>
      <List.Subheader>{t('settings.appearance.title')}</List.Subheader>
      <List.Item
        description={t('settings.appearance.colorModeDesc')}
        descriptionNumberOfLines={2}
        title={t('settings.appearance.colorMode')}
      />
      <SegmentedButtons
        buttons={MODES.map(mode => ({
          value: mode,
          label: t(`settings.modeOptions.${mode}.label`),
          testID: `color-mode-${mode}`
        }))}
        density="small"
        onValueChange={value => setAppearance({ colorMode: value as ColorMode })}
        style={styles.inset}
        value={colorMode}
      />
      <List.Item
        description={themeLabel}
        onPress={() => router.push('/settings/theme')}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        testID="theme-row"
        title={t('settings.appearance.themeTitle')}
      />
      <List.Item title={t('assistant.themePicker.accent')} />
      <View accessibilityRole="radiogroup" style={[styles.inset, styles.swatches]}>
        {swatches.map(swatch => {
          const selected = swatch.id === accent || (swatch.id === null && accent === 'nous')

          return (
            <Pressable
              accessibilityLabel={swatch.name}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={swatch.id ?? 'theme'}
              onPress={() => setAppearance({ accent: swatch.id })}
              style={[styles.ring, { borderColor: selected ? colors.onSurface : 'transparent' }]}
              testID={`accent-${swatch.id ?? 'theme'}`}
            >
              <View style={[styles.swatch, { backgroundColor: swatch.hex, borderColor: colors.outline }]} />
            </Pressable>
          )
        })}
      </View>
    </List.Section>
  )
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: space.screen + space.step, marginBottom: space.listGap },
  ring: { borderRadius: SWATCH_SIZE, borderWidth: 2, padding: 2 },
  swatch: {
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    height: SWATCH_SIZE,
    width: SWATCH_SIZE
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.step }
})
