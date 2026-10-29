import { useStore } from '@nanostores/react'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Badge, FAB, Searchbar, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { SessionListRow } from '@/components/session-list-row'
import type { SessionRow } from '@/gateway/sessions-api'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { $pendingMemoryCount, keepMemoryCountCurrent } from '@/store/memory-review'
import {
  $hasMoreSessions,
  $markers,
  $sessionRows,
  keepSessionsCurrent,
  loadMoreSessions,
  reloadMarkers,
  reloadSessions,
  type SearchResult,
  searchForSessions
} from '@/store/sessions'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

export const SEARCH_DEBOUNCE_MS = 300

/** Searches 300 ms after the person stops typing. Null while the box is empty. */
function useSessionSearch(query: string): { result: SearchResult | null; searching: boolean } {
  const offline = useConnectionStatus() === 'offline'
  const [result, setResult] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const text = query.trim()

    if (!text) {
      setResult(null)
      setSearching(false)

      return
    }

    let live = true
    setSearching(true)

    const timer = setTimeout(() => {
      searchForSessions(text)
        .then(found => live && setResult(found))
        .catch(() => live && setResult({ rows: [], savedOnly: false }))
        .finally(() => live && setSearching(false))
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, offline])

  return { result, searching }
}

/** The app's home: search, recent sessions with their markers, and a new session button. */
export function SessionsScreen() {
  const { colors } = useHermesTheme()
  const gateway = useStore($gateway)
  const rows = useStore($sessionRows)
  const markers = useStore($markers)
  const hasMore = useStore($hasMoreSessions)
  const pendingMemories = useStore($pendingMemoryCount)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const { result, searching } = useSessionSearch(query)

  // While the screen is on screen: reload now, then keep the list current.
  useFocusEffect(
    useCallback(() => {
      if (!gateway) {
        return
      }

      void reloadSessions(gateway)
      void reloadMarkers(gateway)

      const stopSessions = keepSessionsCurrent(gateway)
      const stopMemories = keepMemoryCountCurrent(gateway)

      return () => {
        stopSessions()
        stopMemories()
      }
    }, [gateway])
  )

  const refresh = useCallback(async () => {
    setRefreshing(true)

    try {
      await Promise.all([reloadSessions(), reloadMarkers()])
    } finally {
      setRefreshing(false)
    }
  }, [])

  const open = useCallback((row: SessionRow) => router.push({ pathname: '/session/[id]', params: { id: row.id } }), [])

  const shown = result ? result.rows : rows
  const searchingText = query.trim()

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.Content title={t('sidebar.sessions')} />
        <View>
          <Appbar.Action
            accessibilityLabel={
              pendingMemories > 0
                ? t('app.memoryReview.openWithCount', { count: pendingMemories })
                : t('app.memoryReview.open')
            }
            icon="lightbulb-outline"
            onPress={() => router.push('/memory-review')}
            testID="open-memory-review"
          />
          {pendingMemories > 0 ? (
            <Badge size={16} style={styles.badge} testID="memory-count">
              {pendingMemories}
            </Badge>
          ) : null}
        </View>
        <Appbar.Action
          accessibilityLabel={t('settings.nav.keysSettings')}
          icon="cog"
          onPress={() => router.push('/settings')}
          testID="open-settings"
        />
      </Appbar.Header>
      <OfflineBanner />
      <View style={styles.search}>
        <Searchbar
          accessibilityLabel={t('sidebar.searchAria')}
          autoCapitalize="none"
          autoCorrect={false}
          inputStyle={styles.searchInput}
          loading={searching}
          onChangeText={setQuery}
          placeholder={t('sidebar.searchPlaceholder')}
          style={styles.searchBar}
          testID="session-search"
          value={query}
        />
        {result?.savedOnly ? (
          <Text style={[styles.note, { color: colors.onSurfaceVariant }]} testID="saved-only-note" variant="bodySmall">
            {t('app.sessions.savedOnlySearch')}
          </Text>
        ) : null}
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={shown}
        keyExtractor={row => row.id}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.onSurfaceVariant }]} variant="bodyMedium">
            {searchingText ? t('sidebar.noMatch', { query: searchingText }) : t('sidebar.noSessions')}
          </Text>
        }
        ListFooterComponent={!result && hasMore ? <ActivityIndicator style={styles.more} /> : null}
        onEndReached={result ? undefined : () => void loadMoreSessions()}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} />}
        renderItem={({ item }) => <SessionListRow marker={markers[item.id] ?? null} onPress={open} row={item} />}
      />
      <FAB
        icon="plus"
        label={t('sidebar.nav.new-session')}
        onPress={() => router.push({ pathname: '/session/[id]', params: { id: 'new' } })}
        style={styles.fab}
        testID="new-session"
        variant="primary"
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: 6, top: 6 },
  empty: { padding: space.screen },
  fab: { bottom: space.screen * 2, position: 'absolute', right: space.screen },
  fill: { flex: 1 },
  list: { paddingBottom: 96 },
  more: { padding: space.screen },
  note: { paddingHorizontal: space.step, paddingTop: space.step },
  search: { paddingBottom: space.step, paddingHorizontal: space.screen },
  searchBar: { height: 44 },
  searchInput: { minHeight: 44 }
})
