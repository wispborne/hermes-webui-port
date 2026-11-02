import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { List } from 'react-native-paper'

import { type SlashSuggestion, suggestCommands } from '@/store/slash'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/** Waits this long after a key press before asking the gateway. */
const TYPING_PAUSE_MS = 150

/** The commands that match what's typed, above the message box while it starts with "/". */
export function SlashSuggestions({ draft, onChoose, sessionKey }: { draft: string; onChoose: (text: string) => void; sessionKey: string }) {
  const { colors } = useHermesTheme()
  const [suggestions, setSuggestions] = useState<SlashSuggestion[]>([])
  const typing = draft.startsWith('/') && !draft.includes('\n')

  useEffect(() => {
    if (!typing) {
      setSuggestions([])

      return
    }

    let live = true
    const timer = setTimeout(() => {
      suggestCommands(sessionKey, draft).then(
        found => live && setSuggestions(found.filter(item => item.text.trim() !== draft.trim())),
        (error: unknown) => console.warn('Could not load command suggestions', error)
      )
    }, TYPING_PAUSE_MS)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [draft, sessionKey, typing])

  if (!typing || suggestions.length === 0) {
    return null
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="always"
      style={[styles.list, { backgroundColor: colors.surfaceContainer, borderColor: colors.outline }]}
      testID="slash-suggestions"
    >
      {suggestions.map(item => (
        <List.Item
          description={item.description || undefined}
          descriptionNumberOfLines={1}
          key={item.text}
          onPress={() => onChoose(item.text)}
          style={styles.item}
          testID={`slash-${item.label}`}
          title={item.label}
          titleStyle={styles.title}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  item: { paddingVertical: 2 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, flexGrow: 0, maxHeight: 240 },
  title: { fontFamily: 'monospace', fontSize: 14 }
})
