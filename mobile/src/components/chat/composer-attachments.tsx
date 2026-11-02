import { Image, ScrollView, StyleSheet, View } from 'react-native'
import { Dialog, Icon, IconButton, List, Portal, Text } from 'react-native-paper'

import type { Attachment } from '@/chat/attachments'
import { t } from '@/i18n/t'
import { space } from '@/theme/compact'
import { useHermesTheme } from '@/theme/use-hermes-theme'

export type AttachSource = 'photos' | 'camera' | 'files'

/** The paperclip's choices: photos from the phone, a new photo, or any file. */
export function AttachDialog({ onChoose, onDismiss, visible }: { onChoose: (source: AttachSource) => void; onDismiss: () => void; visible: boolean }) {
  return (
    <Portal>
      <Dialog onDismiss={onDismiss} visible={visible}>
        <Dialog.Title>{t('app.chat.attach')}</Dialog.Title>
        <Dialog.Content style={styles.choices}>
          <List.Item left={props => <List.Icon {...props} icon="image-multiple-outline" />} onPress={() => onChoose('photos')} title={t('app.chat.attachPhotos')} />
          <List.Item left={props => <List.Icon {...props} icon="camera-outline" />} onPress={() => onChoose('camera')} title={t('app.chat.attachCamera')} />
          <List.Item left={props => <List.Icon {...props} icon="paperclip" />} onPress={() => onChoose('files')} title={t('app.chat.attachFile')} />
        </Dialog.Content>
      </Dialog>
    </Portal>
  )
}

/** The photos and files waiting to go with the next message, each with Remove. */
export function PendingAttachments({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (attachment: Attachment) => void }) {
  const { colors } = useHermesTheme()

  if (!attachments.length) {
    return null
  }

  return (
    <ScrollView contentContainerStyle={styles.row} horizontal style={styles.strip} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
      {attachments.map(attachment => (
        <View
          key={attachment.uri}
          style={[styles.chip, { backgroundColor: colors.surfaceContainer, borderColor: colors.outline }]}
          testID={`attachment-${attachment.name}`}
        >
          {attachment.kind === 'image' ? (
            <Image source={{ uri: attachment.uri }} style={styles.thumbnail} />
          ) : (
            <Icon color={colors.onSurfaceVariant} size={20} source="file-outline" />
          )}
          <Text numberOfLines={1} style={styles.name} variant="labelMedium">
            {attachment.name}
          </Text>
          <IconButton
            accessibilityLabel={t('app.chat.removeAttachment', { name: attachment.name })}
            icon="close"
            onPress={() => onRemove(attachment)}
            size={16}
            style={styles.remove}
          />
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: space.step * 2,
    paddingLeft: space.step,
    paddingVertical: space.step
  },
  choices: { paddingHorizontal: space.step },
  name: { maxWidth: 140 },
  remove: { margin: 0 },
  row: { alignItems: 'center', gap: space.listGap, paddingHorizontal: space.listGap, paddingVertical: space.listGap },
  // Without this the strip grows to fill the space above the message box.
  strip: { flexGrow: 0 },
  thumbnail: { borderRadius: 4, height: 36, width: 36 }
})
