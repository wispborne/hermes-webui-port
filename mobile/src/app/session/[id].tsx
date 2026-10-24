import { useLocalSearchParams } from 'expo-router'

import { SessionScreen } from '@/screens/session-screen'

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()

  // A new key per id, so a new session's screen starts fresh.
  return <SessionScreen id={id} key={id} />
}
