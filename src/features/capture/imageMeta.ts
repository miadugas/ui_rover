/**
 * Decode + thumbnail helpers for image intake (plan §5 `thumb`, §6).
 *
 * Both functions are Canvas/bitmap bound, which jsdom does not implement, so
 * they are verified in the manual browser check — the unit tests in this folder
 * cover only the pure validation (`imageLimits`) and the hook's state, which
 * mocks this module. Keep any logic worth testing out of here.
 */
import { THUMB_MAX_EDGE } from './imageLimits'

const THUMB_QUALITY = 0.85

export interface ImageMeta {
  width: number
  height: number
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

export async function readImageMeta(blob: Blob): Promise<ImageMeta> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const meta = { width: bitmap.width, height: bitmap.height }
      bitmap.close?.()
      return meta
    } catch {
      return readMetaViaElement(blob)
    }
  }
  return readMetaViaElement(blob)
}

export async function makeThumb(blob: Blob, maxEdge = THUMB_MAX_EDGE): Promise<Blob> {
  const decoded = await decodeImage(blob)
  try {
    const longestEdge = Math.max(decoded.width, decoded.height)
    const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')
    context.drawImage(decoded.source, 0, 0, width, height)

    return await canvasToBlob(canvas, thumbMimeType(), THUMB_QUALITY)
  } finally {
    decoded.release()
  }
}

let cachedThumbMimeType: string | undefined

function thumbMimeType(): string {
  if (cachedThumbMimeType) return cachedThumbMimeType
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const supportsWebp = probe.toDataURL('image/webp').startsWith('data:image/webp')
  cachedThumbMimeType = supportsWebp ? 'image/webp' : 'image/jpeg'
  return cachedThumbMimeType
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('could not encode thumbnail'))
          return
        }
        resolve(blob)
      },
      mime,
      quality,
    )
  })
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      }
    } catch {
      return decodeViaElement(blob)
    }
  }
  return decodeViaElement(blob)
}

function decodeViaElement(blob: Blob): Promise<DecodedImage> {
  return loadImageElement(blob).then(({ image, revoke }) => ({
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: revoke,
  }))
}

function readMetaViaElement(blob: Blob): Promise<ImageMeta> {
  return loadImageElement(blob).then(({ image, revoke }) => {
    const meta = { width: image.naturalWidth, height: image.naturalHeight }
    revoke()
    return meta
  })
}

function loadImageElement(blob: Blob): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const revoke = () => URL.revokeObjectURL(objectUrl)
    const image = new Image()
    image.onload = () => resolve({ image, revoke })
    image.onerror = () => {
      revoke()
      reject(new Error('could not decode image'))
    }
    image.src = objectUrl
  })
}
