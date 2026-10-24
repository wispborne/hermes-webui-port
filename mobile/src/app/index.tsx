import { useStore } from '@nanostores/react'
import { Redirect } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator } from 'react-native-paper'

import { $auth } from '@/store/gateway'

/** Waits for the start check, then opens Sessions or Sign in. */
export default function Start() {
  const auth = useStore($auth)

  if (auth.phase === 'signed-in') {
    return <Redirect href="/sessions" />
  }

  if (auth.phase === 'signed-out') {
    return <Redirect href="/sign-in" />
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  )
}

const styles = StyleSheet.create({ center: { alignItems: 'center', flex: 1, justifyContent: 'center' } })
