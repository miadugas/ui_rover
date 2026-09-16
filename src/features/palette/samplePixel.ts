import { toHex } from './quantize'

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export async function samplePixel(
  blob: Blob,
  nx: number,
  ny: number,
): Promise<string> {
  const bitmap = await createImageBitmap(blob)

  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error('Image has invalid dimensions')
    }

    const sourceX = Math.min(
      bitmap.width - 1,
      Math.floor(clampUnit(nx) * bitmap.width),
    )
    const sourceY = Math.min(
      bitmap.height - 1,
      Math.floor(clampUnit(ny) * bitmap.height),
    )
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas 2D context is unavailable')

    context.drawImage(bitmap, sourceX, sourceY, 1, 1, 0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return toHex({ r, g, b })
  } finally {
    bitmap.close()
  }
}
