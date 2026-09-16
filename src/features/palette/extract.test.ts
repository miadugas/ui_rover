import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROLES } from '../../types'
import { downsample } from './downsample'
import { extract, ExtractionError } from './extract'

vi.mock('./downsample', () => ({
  downsample: vi.fn(),
}))

function syntheticPixels(
  colors: Array<[number, number, number, number]>,
): Uint8ClampedArray {
  return Uint8ClampedArray.from(colors.flat())
}

describe('extract', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('composes palette extraction and role assignment', async () => {
    vi.mocked(downsample).mockResolvedValue({
      data: syntheticPixels([
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
        [255, 255, 255, 255],
      ]),
      width: 4,
      height: 1,
    })

    const result = await extract(new Blob(['image']))

    expect(result.colors).toEqual([
      '#ffffff',
      '#00ff00',
      '#ff0000',
      '#0000ff',
    ])
    expect(Object.keys(result.roleMap).sort()).toEqual([...ROLES].sort())
    expect(result.degraded).toBe(false)
  })

  it('throws ExtractionError when every pixel is transparent', async () => {
    vi.mocked(downsample).mockResolvedValue({
      data: syntheticPixels([
        [255, 0, 0, 0],
        [0, 255, 0, 127],
      ]),
      width: 2,
      height: 1,
    })

    await expect(extract(new Blob(['transparent']))).rejects.toBeInstanceOf(
      ExtractionError,
    )
  })
})
