jest.mock('expo-image-picker', () => ({}))
jest.mock('expo-document-picker', () => ({}))
jest.mock('expo-file-system', () => ({}))

import { photoName } from './pick-attachments'

describe('photoName', () => {
  const now = new Date(2026, 10, 1, 22, 35, 7)

  it('keeps a real file name', () => {
    expect(photoName('raised-beds.jpg', now)).toBe('raised-beds.jpg')
  })

  it("replaces Android's library number with the date and time", () => {
    expect(photoName('36.jpg', now)).toBe('photo-2026-11-01-223507.jpg')
    expect(photoName('1000000042.png', now)).toBe('photo-2026-11-01-223507.png')
  })

  it('names a photo that has no name', () => {
    expect(photoName(null, now)).toBe('photo-2026-11-01-223507.jpg')
  })
})
