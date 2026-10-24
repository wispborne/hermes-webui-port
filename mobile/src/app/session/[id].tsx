import { useLocalSearchParams } from 'expo-router'
import { Appbar, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'

/** A placeholder until the session-chat change fills it in. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={id} />
      </Appbar.Header>
      <Text style={{ padding: 12 }}>{id}</Text>
    </SafeAreaView>
  )
}
