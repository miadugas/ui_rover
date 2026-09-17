/**
 * Canvas-bound crop/upscale for the OCR input (plan §2, §12 performance notes).
 *
 * jsdom implements neither `createImageBitmap` nor a real 2D context, so — like
 * `downsample` and `imageMeta` — these two functions are covered by the manual
 * browser check rather than unit tests. Keep any logic worth testing out of
 * here; `cropRect.ts` owns the rect math.
 */
import type { NormalizedRect } from '../../../types'
import { clampRect } from './cropRect'
import { OCR_CROP_WIDTH } from './ocrConfig'

export interface CropToBlobOptions {
  targetWidth?: number
  minWidth?: number
  maxWidth?: number
}

interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

const CROP_MIME = 'image/png'

/**
 * Hex codes on a 1080px card are ~10 px tall, below Tesseract's ~20–30 px
 * sweet spot, so the crop is drawn to `targetWidth` (clamped into
 * [`minWidth`, `maxWidth`]) with smoothing on. The spike measured the accuracy
 * peak at exactly 1200 px; nearest-neighbour upscaling halves the hit rate.
 */
export async function cropToBlob(
  blob: Blob,
  rect: NormalizedRect,
  {
    targetWidth = OCR_CROP_WIDTH,
    minWidth = OCR_CROP_WIDTH,
    maxWidth = 2000,
  }: CropToBlobOptions = {},
): Promise<Blob> {
  const decoded = await decodeImage(blob)

  try {
    const source = pixelRectFrom(rect, decoded.width, decoded.height)
    const outputWidth = clamp(targetWidth, minWidth, maxWidth)
    return await drawToBlob(decoded, source, outputWidth / source.width)
  } finally {
    decoded.release()
  }
}

/** The no-crop path: OCR on a full screenshot is capped at `maxEdge`. */
export async function downscaleForOcr(
  blob: Blob,
  maxEdge = 2000,
): Promise<Blob> {
  const decoded = await decodeImage(blob)

  try {
    const longestEdge = Math.max(decoded.width, decoded.height)
    const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1
    const source = {
      x: 0,
      y: 0,
      width: decoded.width,
      height: decoded.height,
    }
    return await drawToBlob(decoded, source, scale)
  } finally {
    decoded.release()
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function pixelRectFrom(
  rect: NormalizedRect,
  width: number,
  height: number,
): PixelRect {
  const clamped = clampRect(rect)
  const x = Math.min(width - 1, Math.max(0, Math.round(clamped.x * width)))
  const y = Math.min(height - 1, Math.max(0, Math.round(clamped.y * height)))

  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(clamped.w * width))),
    height: Math.max(1, Math.min(height - y, Math.round(clamped.h * height))),
  }
}

async function drawToBlob(
  decoded: DecodedImage,
  source: PixelRect,
  scale: number,
): Promise<Blob> {
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d canvas context unavailable')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    decoded.source,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    width,
    height,
  )

  return await canvasToBlob(canvas)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('could not encode crop'))
        return
      }
      resolve(blob)
    }, CROP_MIME)
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
      return await decodeViaElement(blob)
    }
  }

  return await decodeViaElement(blob)
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
