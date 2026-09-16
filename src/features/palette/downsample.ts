export interface DownsampledImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export async function downsample(
  blob: Blob,
  maxEdge = 160,
): Promise<DownsampledImage> {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new RangeError('maxEdge must be greater than zero')
  }

  const bitmap = await createImageBitmap(blob)

  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error('Image has invalid dimensions')
    }

    const scale = Math.min(1, Math.floor(maxEdge) / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas 2D context is unavailable')

    context.drawImage(bitmap, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    return { data, width, height }
  } finally {
    bitmap.close()
  }
}
