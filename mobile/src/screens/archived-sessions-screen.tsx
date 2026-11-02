import { useStore } from '@nanostores/react'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { FlatList, StyleSheet } from 'react-native'
import { ActivityIndicator, Appbar, Text } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { SessionActions } from '@/components/session-actions'
import { SessionListRow } from '@/components/session-list-row'
import type { SessionRow } from '@/gateway/sessions-api'
import { isUnreachableError } from '@/gateway/rest'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { loadArchivedSessions } from '@/store/sessions'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

/**
 * Settings ▸ Archived Chats: the archived sessions, newest first. A long
 * press offers Unarchive and Delete. Read from the gateway each time, so it
 * needs a connection.
 */
export function ArchivedSessionsScreen() {
  const { colors } = useHermesTheme()
  const gateway = useStore($gateway)
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [menu, setMenu] = useState<SessionRow | null>(null)
  const loadingMore = useRef(false)

  useFocusEffect(
    useCallback(() => {
      if (!gateway) {
        return
      }

      let live = true

      loadArchivedSessions()
        .then(page => {
          if (live) {
            setRows(page.rows)
            setHasMore(page.hasMore)
          }
        })
        .catch((error: unknown) => {
          if (!isUnreachableError(error)) {
            console.warn('Could not load archived sessions', error)
          }

          if (live) {
            setRows(current => current ?? [])
          }
        })

      return () => {
        live = false
      }
    }, [gateway])
  )

  const loadMore = async () => {
    if (!rows || !hasMore || loadingMore.current) {
      return
    }

    loadingMore.current = true

    try {
      const page = await loadArchivedSessions(rows.length)
      const known = new Set(rows.map(row => row.id))

      setRows([...rows, ...page.rows.filter(row => !known.has(row.id))])
      setHasMore(page.hasMore && page.rows.length > 0)
    } catch (error) {
      if (!isUnreachableError(error)) {
        console.warn('Could not load more archived sessions', error)
      }
    } finally {
      loadingMore.current = false
    }
  }

  const open = useCallback((row: SessionRow) => router.push({ pathname: '/session/[id]', params: { id: row.id } }), [])
  const openMenu = useCallback((row: SessionRow) => setMenu(row), [])

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} />
        <Appbar.Content title={t('settings.nav.archivedChats')} />
      </Appbar.Header>
      <OfflineBanner />
      {rows === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={row => row.id}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.onSurfaceVariant }]} variant="bodyMedium">
              {t('app.sessions.noArchived')}
            </Text>
          }
          ListFooterComponent={hasMore ? <ActivityIndicator style={styles.loading} /> : null}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => <SessionListRow marker={null} onLongPress={openMenu} onPress={open} row={item} />}
        />
      )}
      <SessionActions
        archived
        onClose={() => setMenu(null)}
        onGone={id => setRows(current => current?.filter(row => row.id !== id) ?? null)}
        row={menu}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  empty: { padding: space.screen },
  fill: { flex: 1 },
  loading: { padding: space.screen }
})
