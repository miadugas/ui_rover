import { describe, expect, it } from 'vitest'
import { detectSwatchBlobs } from './swatchBlobs'
import type { Rgb } from '../quantize'

function image(width: number, height: number, color: Rgb): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = 255
  }

  return pixels
}

function fillRect(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgb,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const offset = (row * imageWidth + column) * 4
      pixels[offset] = color.r
      pixels[offset + 1] = color.g
      pixels[offset + 2] = color.b
      pixels[offset + 3] = 255
    }
  }
}

describe('detectSwatchBlobs', () => {
  it('finds five colored squares on white in descending area order', () => {
    const pixels = image(80, 60, { r: 255, g: 255, b: 255 })
    fillRect(pixels, 80, 2, 2, 14, 14, { r: 255, g: 0, b: 0 })
    fillRect(pixels, 80, 20, 2, 12, 12, { r: 0, g: 255, b: 0 })
    fillRect(pixels, 80, 35, 2, 10, 10, { r: 0, g: 0, b: 255 })
    fillRect(pixels, 80, 48, 2, 8, 8, { r: 255, g: 255, b: 0 })
    fillRect(pixels, 80, 60, 2, 6, 6, { r: 255, g: 0, b: 255 })

    const blobs = detectSwatchBlobs(pixels, 80, 60)

    expect(blobs.map(({ hex }) => hex)).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#ff00ff',
    ])
    expect(blobs.map(({ area }) => area)).toEqual([196, 144, 100, 64, 36])
  })

  it('drops both a page background and a large chrome band', () => {
    const pixels = image(40, 40, { r: 255, g: 255, b: 255 })
    fillRect(pixels, 40, 0, 0, 40, 10, { r: 32, g: 32, b: 32 })

    expect(detectSwatchBlobs(pixels, 40, 40)).toEqual([])
  })

  it('keeps a small swatch that touches two image edges', () => {
    const pixels = image(40, 40, { r: 255, g: 255, b: 255 })
    fillRect(pixels, 40, 0, 0, 10, 10, { r: 255, g: 0, b: 0 })

    expect(detectSwatchBlobs(pixels, 40, 40)).toEqual([
      {
        hex: '#ff0000',
        area: 100,
        bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
      },
    ])
  })

  it('rejects a thin rule by aspect ratio', () => {
    const pixels = image(50, 40, { r: 255, g: 255, b: 255 })
    fillRect(pixels, 50, 5, 10, 40, 2, { r: 0, g: 0, b: 0 })

    expect(detectSwatchBlobs(pixels, 50, 40)).toEqual([])
  })

  it('merges near-duplicate colors and keeps the larger blob', () => {
    const pixels = image(40, 30, { r: 255, g: 255, b: 255 })
    fillRect(pixels, 40, 2, 2, 12, 12, { r: 100, g: 100, b: 100 })
    fillRect(pixels, 40, 20, 2, 10, 10, { r: 110, g: 105, b: 100 })

    expect(detectSwatchBlobs(pixels, 40, 30)).toEqual([
      {
        hex: '#646464',
        area: 144,
        bbox: { x0: 2, y0: 2, x1: 14, y1: 14 },
      },
    ])
  })
})
