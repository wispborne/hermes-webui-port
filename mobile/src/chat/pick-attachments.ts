// The three ways to add to a message: photos from the phone, a new photo
// from the camera, and any file. Each returns the app's own copies (see
// attachments.ts), or nothing when the person backs out.

import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

import { type Attachment, keepAttachment } from './attachments'

/** JPEG quality for photos: keeps a phone photo to a few hundred KB. */
const PHOTO_QUALITY = 0.8

/**
 * Android's photo picker names a photo by its number in the phone's library
 * ("36.jpg"), so those get a name from the date and time instead.
 */
export function photoName(fileName: string | null | undefined, now = new Date()): string {
  if (fileName && !/^\d+(\.\w+)?$/.test(fileName)) {
    return fileName
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const extension = fileName?.match(/\.\w+$/)?.[0] ?? '.jpg'

  return `photo-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${extension}`
}

const keepPhotos = (result: ImagePicker.ImagePickerResult) =>
  result.canceled
    ? Promise.resolve([])
    : Promise.all(
        result.assets.map((asset, index) =>
          keepAttachment(
            { uri: asset.uri, name: photoName(asset.fileName).replace(/(\.\w+)$/, index ? `-${index + 1}$1` : '$1'), mime: asset.mimeType },
            'image'
          )
        )
      )

export async function pickPhotos(): Promise<Attachment[]> {
  return keepPhotos(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: PHOTO_QUALITY }))
}

/** Null when the person refused the camera. */
export async function takePhoto(): Promise<Attachment[] | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()

  if (!permission.granted) {
    return null
  }

  return keepPhotos(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: PHOTO_QUALITY }))
}

export async function pickFiles(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })

  if (result.canceled) {
    return []
  }

  return Promise.all(
    result.assets.map(asset =>
      keepAttachment({ uri: asset.uri, name: asset.name, mime: asset.mimeType }, asset.mimeType?.startsWith('image/') ? 'image' : 'file')
    )
  )
}
