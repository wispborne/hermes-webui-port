import { useStore } from '@nanostores/react'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Keyboard, RefreshControl, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Appbar, Badge, Button, Dialog, FAB, List, Portal, Searchbar, Snackbar, Text, TextInput } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OfflineBanner } from '@/components/offline-banner'
import { SessionListRow, sessionHeading } from '@/components/session-list-row'
import type { SessionRow } from '@/gateway/sessions-api'
import { useConnectionStatus } from '@/hooks/use-connection-status'
import { t } from '@/i18n/t'
import { $gateway } from '@/store/gateway'
import { $pendingMemoryCount, keepMemoryCountCurrent } from '@/store/memory-review'
import {
  $hasMoreSessions,
  $markers,
  $sessionRows,
  deleteSession,
  keepSessionsCurrent,
  loadMoreSessions,
  orderSessions,
  reloadMarkers,
  reloadSessions,
  renameSession,
  type SearchResult,
  searchForSessions,
  setSessionPinned
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
  const ordered = useMemo(() => orderSessions(rows, markers), [rows, markers])
  const shown = result ? result.rows : ordered
  const [menu, setMenu] = useState<SessionRow | null>(null)
  const openMenu = useCallback((row: SessionRow) => setMenu(row), [])
  const [renaming, setRenaming] = useState<{ row: SessionRow; title: string } | null>(null)
  const [deleting, setDeleting] = useState<SessionRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const dialogOpen = menu !== null || renaming !== null || deleting !== null

  // A closing dialog hands focus to the search box, which opens the keyboard. Close it again.
  useEffect(() => {
    if (!dialogOpen) {
      Keyboard.dismiss()
    }
  }, [dialogOpen])

  /** Runs an edit from the menu or a dialog. A refused edit leaves the row as it was and says so. */
  const edit = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)

    try {
      await action()
    } catch (error) {
      console.warn('Could not change the session', error)
      setFailed(failure)
    } finally {
      setBusy(false)
      setRenaming(null)
      setDeleting(null)
    }
  }
  const searchingText = query.trim()

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <Appbar.Header mode="small">
        <Appbar.Content title={t('sidebar.sessions')} />
        {/* Only while pending memories wait. Settings ▸ Memory & Context always has the way in. */}
        {pendingMemories > 0 ? (
          <View>
            <Appbar.Action
              accessibilityLabel={t('app.memoryReview.openWithCount', { count: pendingMemories })}
              icon="lightbulb-outline"
              onPress={() => router.push('/memory-review')}
              testID="open-memory-review"
            />
            <Badge size={16} style={styles.badge} testID="memory-count">
              {pendingMemories}
            </Badge>
          </View>
        ) : null}
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
        renderItem={({ item }) => <SessionListRow marker={markers[item.id] ?? null} onLongPress={openMenu} onPress={open} row={item} />}
      />
      <Portal>
        <Dialog onDismiss={() => setMenu(null)} visible={menu !== null}>
          <Dialog.Title numberOfLines={1}>{menu ? sessionHeading(menu) : ''}</Dialog.Title>
          <Dialog.Content style={styles.actions}>
            <List.Item
              left={props => <List.Icon {...props} icon="pencil" />}
              onPress={() => {
                setRenaming(menu && { row: menu, title: menu.title ?? '' })
                setMenu(null)
              }}
              title={t('sidebar.row.rename')}
            />
            <List.Item
              left={props => <List.Icon {...props} icon={menu?.pinned ? 'pin-off' : 'pin'} />}
              onPress={() => {
                const row = menu
                setMenu(null)

                if (row) {
                  void edit(() => setSessionPinned(row.id, !row.pinned), t(row.pinned ? 'app.sessions.unpinFailed' : 'app.sessions.pinFailed'))
                }
              }}
              title={t(menu?.pinned ? 'sidebar.row.unpin' : 'sidebar.row.pin')}
            />
            <List.Item
              left={props => <List.Icon {...props} color={colors.error} icon="delete" />}
              onPress={() => {
                setDeleting(menu)
                setMenu(null)
              }}
              title={t('common.delete')}
              titleStyle={{ color: colors.error }}
            />
          </Dialog.Content>
        </Dialog>
        <Dialog onDismiss={() => setRenaming(null)} visible={renaming !== null}>
          <Dialog.Title>{t('sidebar.row.renameTitle')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              autoFocus
              mode="outlined"
              onChangeText={title => setRenaming(current => current && { ...current, title })}
              placeholder={renaming ? sessionHeading(renaming.row) : undefined}
              testID="rename-input"
              value={renaming?.title ?? ''}
            />
            <Text style={[styles.note, { color: colors.onSurfaceVariant }]} variant="bodySmall">
              {t('sidebar.row.renameDesc')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRenaming(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={busy}
              loading={busy}
              onPress={() => renaming && void edit(() => renameSession(renaming.row.id, renaming.title), t('app.sessions.renameFailed'))}
              testID="rename-save"
            >
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog onDismiss={() => setDeleting(null)} visible={deleting !== null}>
          <Dialog.Title>{t('sidebar.row.deleteTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{deleting ? t('sidebar.row.deleteDesc', { title: sessionHeading(deleting) }) : ''}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={busy}
              loading={busy}
              onPress={() => deleting && void edit(() => deleteSession(deleting.id), t('app.sessions.deleteFailed'))}
              testID="delete-confirm"
              textColor={colors.error}
            >
              {t('common.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar duration={4000} onDismiss={() => setFailed(null)} visible={failed !== null}>
        {failed ?? ''}
      </Snackbar>
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
  actions: { paddingHorizontal: space.step },
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
