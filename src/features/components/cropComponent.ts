/**
 * Natural-size component crop (plan §5 `cropComponent`).
 *
 * Canvas- and bitmap-bound, which jsdom does not implement, so the encode path
 * is verified in the manual browser check — only `pixelRect` is unit-tested.
 * Keep any logic worth testing out of here.
 */
import { MAX_IMAGE_BYTES } from '../capture/imageLimits'
import { makeThumb } from '../capture/imageMeta'
import type { NormalizedRect } from '../../types'

const CROP_QUALITY = 0.92

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

export interface ComponentCrop {
  blob: Blob
  width: number
  height: number
  mime: string
  thumb: Blob
}

export class ComponentTooLargeError extends Error {
  constructor() {
    super('Crop is too large — draw a smaller area')
    this.name = 'ComponentTooLargeError'
  }
}

/**
 * Normalized rect → integer source rect inside a `width` × `height` image.
 * Always at least 1px on each edge and always fully inside the image.
 */
export function pixelRect(
  rect: NormalizedRect,
  width: number,
  height: number,
): PixelRect {
  const imageWidth = Math.max(1, Math.floor(width))
  const imageHeight = Math.max(1, Math.floor(height))

  const x = clamp(Math.round(rect.x * imageWidth), 0, imageWidth - 1)
  const y = clamp(Math.round(rect.y * imageHeight), 0, imageHeight - 1)
  const w = clamp(Math.round(rect.w * imageWidth), 1, imageWidth - x)
  const h = clamp(Math.round(rect.h * imageHeight), 1, imageHeight - y)

  return { x, y, w, h }
}

export async function cropComponent(
  parentBlob: Blob,
  rect: NormalizedRect,
): Promise<ComponentCrop> {
  const decoded = await decodeImage(parentBlob)

  try {
    const source = pixelRect(rect, decoded.width, decoded.height)

    const canvas = document.createElement('canvas')
    canvas.width = source.w
    canvas.height = source.h

    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d canvas context unavailable')
    // 1:1 draw — no resampling happens, so smoothing settings are irrelevant.
    context.drawImage(
      decoded.source,
      source.x,
      source.y,
      source.w,
      source.h,
      0,
      0,
      source.w,
      source.h,
    )

    const mime = cropMimeType()
    const blob = await canvasToBlob(canvas, mime, CROP_QUALITY)
    if (blob.size > MAX_IMAGE_BYTES) throw new ComponentTooLargeError()

    const thumb = await makeThumb(blob)
    return { blob, width: source.w, height: source.h, mime, thumb }
  } finally {
    decoded.release()
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

let cachedCropMimeType: string | undefined

/**
 * Same probe `imageMeta.thumbMimeType` uses — WebP when the canvas can encode
 * it, else JPEG. Replicated rather than imported because that helper is module
 * private; the crop and its thumb must agree on the format.
 */
function cropMimeType(): string {
  if (cachedCropMimeType) return cachedCropMimeType
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const supportsWebp = probe.toDataURL('image/webp').startsWith('data:image/webp')
  cachedCropMimeType = supportsWebp ? 'image/webp' : 'image/jpeg'
  return cachedCropMimeType
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('could not encode crop'))
          return
        }
        resolve(blob)
      },
      mime,
      quality,
    )
  })
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
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
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const revoke = () => URL.revokeObjectURL(objectUrl)
    const image = new Image()
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: revoke,
      })
    image.onerror = () => {
      revoke()
      reject(new Error('could not decode image'))
    }
    image.src = objectUrl
  })
}
