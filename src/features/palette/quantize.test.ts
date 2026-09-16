import { describe, expect, it } from 'vitest'
import {
  dedupe,
  fromHex,
  quantize,
  sortByLuminance,
  toHex,
} from './quantize'
import type { Rgb } from './quantize'

function solidBlocks(colors: Rgb[], pixelsPerBlock = 40 * 40): Uint8ClampedArray {
  const values: number[] = []

  for (const color of colors) {
    for (let pixel = 0; pixel < pixelsPerBlock; pixel += 1) {
      values.push(color.r, color.g, color.b, 255)
    }
  }

  return Uint8ClampedArray.from(values)
}

describe('quantize', () => {
  it.each([4, 8, 16])(
    'finds four separated solid colors with %i buckets',
    (buckets) => {
      const pixels = solidBlocks([
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 0, b: 255 },
        { r: 255, g: 255, b: 255 },
      ])

      const colors = dedupe(quantize(pixels, { buckets }))
        .map(toHex)
        .sort()

      expect(colors).toEqual(['#0000ff', '#00ff00', '#ff0000', '#ffffff'])
    },
  )

  it('ignores pixels with alpha below 128', () => {
    const pixels = Uint8ClampedArray.from([
      255, 0, 0, 0,
      0, 255, 0, 127,
      0, 0, 255, 128,
    ])

    expect(quantize(pixels).map(toHex)).toEqual(['#0000ff'])
  })
})

describe('palette color helpers', () => {
  it('merges nearby colors and keeps distant colors', () => {
    expect(
      dedupe([
        { r: 0, g: 0, b: 0 },
        { r: 3, g: 4, b: 0 },
        { r: 200, g: 0, b: 0 },
      ]),
    ).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 200, g: 0, b: 0 },
    ])
  })

  it('sorts from lightest to darkest by relative luminance', () => {
    const colors = sortByLuminance([
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 0, b: 0 },
    ]).map(toHex)

    expect(colors).toEqual(['#ffffff', '#ff0000', '#000000'])
  })

  it('converts short and long hex colors', () => {
    expect(fromHex('#0aF')).toEqual({ r: 0, g: 170, b: 255 })
    expect(toHex(fromHex('#12abEF'))).toBe('#12abef')
  })
})
