import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGES_PER_ENTRY,
  MAX_IMAGE_BYTES,
  validateIncomingFiles,
} from './imageLimits'

function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function imageFiles(count: number): File[] {
  return Array.from({ length: count }, (_unused, idx) => fakeFile(`shot-${idx}.png`, 'image/png'))
}

describe('validateIncomingFiles', () => {
  it('accepts image files and preserves their order', () => {
    const files = imageFiles(3)
    const result = validateIncomingFiles(0, files)

    expect(result.accepted).toEqual(files)
    expect(result.rejected).toEqual([])
  })

  it('rejects anything that is not an image', () => {
    const text = fakeFile('link.txt', 'text/plain')
    const image = fakeFile('shot.png', 'image/png')

    const result = validateIncomingFiles(0, [text, image])

    expect(result.accepted).toEqual([image])
    expect(result.rejected).toEqual([{ file: text, reason: 'not-image' }])
  })

  it('rejects files over the byte cap and keeps one exactly at the cap', () => {
    const atCap = fakeFile('at-cap.png', 'image/png', MAX_IMAGE_BYTES)
    const overCap = fakeFile('over-cap.png', 'image/png', MAX_IMAGE_BYTES + 1)

    const result = validateIncomingFiles(0, [atCap, overCap])

    expect(result.accepted).toEqual([atCap])
    expect(result.rejected).toEqual([{ file: overCap, reason: 'too-large' }])
  })

  it('accepts up to the per-entry cap and rejects the rest as too-many', () => {
    const files = imageFiles(5)

    const result = validateIncomingFiles(MAX_IMAGES_PER_ENTRY - 2, files)

    expect(result.accepted).toEqual(files.slice(0, 2))
    expect(result.rejected).toEqual(
      files.slice(2).map((file) => ({ file, reason: 'too-many' })),
    )
  })

  it('rejects everything once the entry is already full', () => {
    const files = imageFiles(2)

    const result = validateIncomingFiles(MAX_IMAGES_PER_ENTRY, files)

    expect(result.accepted).toEqual([])
    expect(result.rejected.map((entry) => entry.reason)).toEqual(['too-many', 'too-many'])
  })

  it('counts the cap from the existing images, not from the batch', () => {
    const result = validateIncomingFiles(MAX_IMAGES_PER_ENTRY + 3, imageFiles(1))

    expect(result.accepted).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })
})
