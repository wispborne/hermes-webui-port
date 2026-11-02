// Photos and files the person adds to a message. Each is a copy in the app's
// own storage, so it's still there when the message waits in the outbox and
// when Retry sends it again. Copies older than a week are deleted at start-up.

import { Directory, File, Paths } from 'expo-file-system'

export interface Attachment {
  kind: 'image' | 'file'
  /** The app's own copy. */
  uri: string
  name: string
  mime: string | null
}

const KEEP_FOR_MS = 7 * 24 * 60 * 60 * 1000

const folder = () => new Directory(Paths.document, 'attachments')

/** Copies a picked photo or file into the app's storage. */
export async function keepAttachment(picked: { uri: string; name?: string | null; mime?: string | null }, kind: Attachment['kind']): Promise<Attachment> {
  const name = picked.name?.trim() || picked.uri.split('/').pop() || (kind === 'image' ? 'photo.jpg' : 'file')
  const dir = folder()

  dir.create({ idempotent: true, intermediates: true })

  const copy = new File(dir, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.-]+/g, '_')}`)

  await new File(picked.uri).copy(copy)

  return { kind, uri: copy.uri, name, mime: picked.mime ?? null }
}

/** The attachment's bytes as base64. Throws when the copy is gone. */
export function readAttachment(attachment: Attachment): Promise<string> {
  return new File(attachment.uri).base64()
}

export function attachmentExists(attachment: Attachment): boolean {
  return new File(attachment.uri).exists
}

/** Deletes the app's copy, for an attachment removed before sending. */
export function discardAttachment(attachment: Attachment) {
  const file = new File(attachment.uri)

  if (file.exists) {
    file.delete()
  }
}

/** Deletes copies older than a week. */
export function pruneAttachments(now = Date.now()) {
  const dir = folder()

  if (!dir.exists) {
    return
  }

  for (const entry of dir.list()) {
    if (entry instanceof File && now - (entry.modificationTime ?? now) > KEEP_FOR_MS) {
      entry.delete()
    }
  }
}
