import { useStore } from '@nanostores/react'
import { router } from 'expo-router'
import { FlatList, StyleSheet, View } from 'react-native'
import { Appbar, List } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { t } from '@/i18n/t'
import { $appearance, setAppearance } from '@/store/appearance'
import { space } from '@/theme/compact'
import { hermesPalette } from '@/theme/theme'
import themes from '@/theme/themes.generated.json'
import { useHermesTheme } from '@/theme/use-hermes-theme'

const DOT_SIZE = 14

/** The desktop's themes, each with a few of its colours in the current mode. Picking one applies it at once. */
export function ThemeScreen() {
  const { accent, themeName } = useStore($appearance)
  const { colors, dark } = useHermesTheme()
  const scheme = dark ? 'dark' : 'light'

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        <Appbar.Content title={t('settings.appearance.themeTitle')} />
      </Appbar.Header>
      <FlatList
        data={themes}
        keyExtractor={theme => theme.name}
        renderItem={({ item }) => {
          const palette = hermesPalette(scheme, { themeName: item.name, accent })
          const current = item.name === themeName

          return (
            <List.Item
              accessibilityRole="radio"
              accessibilityState={{ selected: current }}
              description={item.description}
              left={() => (
                <View style={styles.dots}>
                  {[palette.background, palette.card, palette.primary, palette.foreground].map((color, index) => (
                    <View key={index} style={[styles.dot, { backgroundColor: color, borderColor: colors.outline }]} />
                  ))}
                </View>
              )}
              onPress={() => setAppearance({ themeName: item.name })}
              right={props => (current ? <List.Icon {...props} color={colors.primary} icon="check" /> : null)}
              testID={`theme-${item.name}`}
              title={item.label}
            />
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: DOT_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    height: DOT_SIZE,
    marginLeft: -DOT_SIZE / 4,
    width: DOT_SIZE
  },
  dots: { alignItems: 'center', flexDirection: 'row', paddingLeft: space.screen + DOT_SIZE / 4 },
  fill: { flex: 1 }
})
