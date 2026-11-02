import { useEffect, useState } from 'react'
import { Keyboard, StyleSheet } from 'react-native'
import { Button, Dialog, List, Portal, Snackbar, Text, TextInput } from 'react-native-paper'

import { sessionHeading } from '@/components/session-list-row'
import type { SessionRow } from '@/gateway/sessions-api'
import { t } from '@/i18n/t'
import { archiveSession, deleteSession, renameSession, setSessionPinned, unarchiveSession } from '@/store/sessions'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

interface Props {
  /** The session whose actions are open, or null when they're closed. */
  row: SessionRow | null
  onClose: () => void
  /** True on Archived Chats: the actions are Unarchive and Delete. */
  archived?: boolean
  /** Called after the session was unarchived or deleted. */
  onGone?: (id: string) => void
  /** Lifts the message after an edit above a button at the bottom of the screen. */
  noticeLift?: number
}

interface Notice {
  text: string
  undo?: () => void
}

/**
 * What a long press on a session offers: Rename, Pin or Unpin, Archive and
 * Delete, or on Archived Chats, Unarchive and Delete. Delete asks first. A
 * refused edit leaves the session as it was and says so.
 */
export function SessionActions({ archived = false, noticeLift = 0, onClose, onGone, row }: Props) {
  const { colors } = useHermesTheme()
  const [renaming, setRenaming] = useState<{ row: SessionRow; title: string } | null>(null)
  const [deleting, setDeleting] = useState<SessionRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const dialogOpen = row !== null || renaming !== null || deleting !== null

  // A closing dialog hands focus to the search box, which opens the keyboard. Close it again.
  useEffect(() => {
    if (!dialogOpen) {
      Keyboard.dismiss()
    }
  }, [dialogOpen])

  const edit = async (action: () => Promise<void>, failure: string, done?: Notice) => {
    setBusy(true)

    try {
      await action()

      if (done) {
        setNotice(done)
      }
    } catch (error) {
      console.warn('Could not change the session', error)
      setNotice({ text: failure })
    } finally {
      setBusy(false)
      setRenaming(null)
      setDeleting(null)
    }
  }

  // Runs one of the actions dialog's items: the dialog closes first.
  const choose = (action: (chosen: SessionRow) => void) => () => {
    if (row) {
      onClose()
      action(row)
    }
  }

  const archive = (chosen: SessionRow) =>
    void edit(() => archiveSession(chosen.id), t('app.sessions.archiveFailed'), {
      text: t('app.sessions.archived'),
      undo: () => void edit(() => unarchiveSession(chosen.id), t('app.sessions.unarchiveFailed'))
    })

  const unarchive = (chosen: SessionRow) =>
    void edit(async () => {
      await unarchiveSession(chosen.id)
      onGone?.(chosen.id)
    }, t('app.sessions.unarchiveFailed'))

  return (
    <>
      <Portal>
        <Dialog onDismiss={onClose} visible={row !== null}>
          <Dialog.Title numberOfLines={1}>{row ? sessionHeading(row) : ''}</Dialog.Title>
          <Dialog.Content style={styles.actions}>
            {archived ? (
              <List.Item
                left={props => <List.Icon {...props} icon="archive-arrow-up-outline" />}
                onPress={choose(unarchive)}
                title={t('sidebar.row.unarchive')}
              />
            ) : (
              <>
                <List.Item
                  left={props => <List.Icon {...props} icon="pencil" />}
                  onPress={choose(chosen => setRenaming({ row: chosen, title: chosen.title ?? '' }))}
                  title={t('sidebar.row.rename')}
                />
                <List.Item
                  left={props => <List.Icon {...props} icon={row?.pinned ? 'pin-off' : 'pin'} />}
                  onPress={choose(
                    chosen =>
                      void edit(
                        () => setSessionPinned(chosen.id, !chosen.pinned),
                        t(chosen.pinned ? 'app.sessions.unpinFailed' : 'app.sessions.pinFailed')
                      )
                  )}
                  title={t(row?.pinned ? 'sidebar.row.unpin' : 'sidebar.row.pin')}
                />
                <List.Item
                  left={props => <List.Icon {...props} icon="archive-outline" />}
                  onPress={choose(archive)}
                  title={t('sidebar.row.archive')}
                />
              </>
            )}
            <List.Item
              left={props => <List.Icon {...props} color={colors.error} icon="delete" />}
              onPress={choose(setDeleting)}
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
              onPress={() =>
                deleting &&
                void edit(async () => {
                  await deleteSession(deleting.id)
                  onGone?.(deleting.id)
                }, t('app.sessions.deleteFailed'))
              }
              testID="delete-confirm"
              textColor={colors.error}
            >
              {t('common.delete')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar
        action={notice?.undo ? { label: t('app.sessions.undo'), onPress: notice.undo } : undefined}
        duration={7000}
        onDismiss={() => setNotice(null)}
        visible={notice !== null}
        wrapperStyle={{ marginBottom: noticeLift }}
      >
        {notice?.text ?? ''}
      </Snackbar>
    </>
  )
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: space.step },
  note: { paddingHorizontal: space.step, paddingTop: space.step }
})
