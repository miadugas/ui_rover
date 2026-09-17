import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downsample } from '../downsample'
import { extract } from '../extract'
import { cropToBlob, downscaleForOcr } from './cropToBlob'
import { parseHexTokens } from './hexTokens'
import type { HexCandidate, OcrWord } from './hexTokens'
import { ocrHexCodes } from './ocrHexCodes'
import { readPalette } from './readPalette'
import { OcrUnavailableError, ReadCancelledError } from './readProgress'
import { detectSwatchBlobs } from './swatchBlobs'
import type { BlobCandidate } from './swatchBlobs'

vi.mock('../downsample', () => ({ downsample: vi.fn() }))
vi.mock('../extract', () => ({ extract: vi.fn() }))
vi.mock('./cropToBlob', () => ({
  cropToBlob: vi.fn(),
  downscaleForOcr: vi.fn(),
}))
vi.mock('./ocrHexCodes', () => ({ ocrHexCodes: vi.fn() }))
vi.mock('./swatchBlobs', () => ({ detectSwatchBlobs: vi.fn() }))

const SOURCE = new Blob(['screenshot'])
const SOURCE_IMAGE_ID = 'img_01'
const BUFFER_EDGE = 240

/** Sits clear of every edge and covers 64 % of the buffer: the card body. */
const CARD: BlobCandidate = {
  hex: '#ffffff',
  area: 192 * 192,
  bbox: { x0: 24, y0: 24, x1: 216, y1: 216 },
}
/** The card bbox normalized over the 240px buffer. Unpadded: padding read 0/5. */
const CARD_CROP = {
  x: 24 / BUFFER_EDGE,
  y: 24 / BUFFER_EDGE,
  w: 192 / BUFFER_EDGE,
  h: 192 / BUFFER_EDGE,
}

interface PlainRect {
  x: number
  y: number
  w: number
  h: number
}

/** The sub-rect `OCR_PASSES[1]` cuts out of an OCR rect. */
function rightColumn({ x, y, w, h }: PlainRect): PlainRect {
  return { x: x + w * 0.55, y, w: w * 0.45, h }
}

const CARD_PASS_OPTIONS = { targetWidth: 1200, minWidth: 1200 }
const COLUMN_PASS_OPTIONS = { targetWidth: 1000, minWidth: 1000 }

/** Five exact codes: enough to stop the pass loop after the first pass. */
function fiveExactCodes(): HexCandidate[] {
  return [
    hexCandidate('#101828'),
    hexCandidate('#2f6bff'),
    hexCandidate('#475467'),
    hexCandidate('#d0d5dd'),
    hexCandidate('#ffffff'),
  ]
}

function hexCandidate(hex: string, repaired = false): HexCandidate {
  return { hex, confidence: repaired ? 60 : 90, repaired }
}

function blobCandidate(
  hex: string,
  area: number,
  bbox: BlobCandidate['bbox'] = { x0: 30, y0: 30, x1: 60, y1: 60 },
): BlobCandidate {
  return { hex, area, bbox }
}

/** Matches the low-threshold options `autoCropFrom` uses for its chip pass. */
const SMALL_PASS_MIN_AREA_FRACTION = 0.0005

/**
 * `autoCropFrom` runs `detectSwatchBlobs` twice — once with the orchestrator's
 * defaults, once at the chip threshold — so the mock answers on the options.
 */
function mockBlobPasses(normal: BlobCandidate[], small: BlobCandidate[]): void {
  vi.mocked(detectSwatchBlobs).mockImplementation(
    (_pixels, _width, _height, options) =>
      options?.minAreaFraction === SMALL_PASS_MIN_AREA_FRACTION
        ? small
        : normal,
  )
}

function cropOf(
  bbox: BlobCandidate['bbox'],
  width: number,
  height: number,
): PlainRect {
  return {
    x: bbox.x0 / width,
    y: bbox.y0 / height,
    w: (bbox.x1 - bbox.x0) / width,
    h: (bbox.y1 - bbox.y0) / height,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(downscaleForOcr).mockResolvedValue(SOURCE)
  vi.mocked(cropToBlob).mockResolvedValue(SOURCE)
  vi.mocked(downsample).mockResolvedValue({
    data: new Uint8ClampedArray(4),
    width: BUFFER_EDGE,
    height: BUFFER_EDGE,
  })
  vi.mocked(detectSwatchBlobs).mockReturnValue([CARD])
  vi.mocked(ocrHexCodes).mockResolvedValue([])
  vi.mocked(extract).mockResolvedValue({
    colors: ['#15181c', '#757a8a'],
    roleMap: {
      background: '#757a8a',
      surface: '#757a8a',
      text: '#15181c',
      muted: '#757a8a',
      primary: '#757a8a',
      accent: '#15181c',
    },
    degraded: true,
  })
})

describe('readPalette source selection', () => {
  it('wins with OCR at three or more hex codes, unrepaired first', async () => {
    vi.mocked(ocrHexCodes).mockResolvedValue([
      hexCandidate('#d0d5dd', true),
      hexCandidate('#101828'),
      hexCandidate('#2f6bff'),
      hexCandidate('#475467'),
    ])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.source).toBe('ocr')
    expect(result.colors).toEqual([
      '#101828',
      '#2f6bff',
      '#475467',
      '#d0d5dd',
    ])
    expect(result.degraded).toBe(false)
    expect(extract).not.toHaveBeenCalled()
  })

  it('falls back to swatch blobs when OCR finds too few codes', async () => {
    vi.mocked(detectSwatchBlobs).mockReturnValue([
      CARD,
      blobCandidate('#2f6bff', 900),
      blobCandidate('#101828', 800),
    ])
    vi.mocked(ocrHexCodes).mockResolvedValue([hexCandidate('#101828')])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.source).toBe('blobs')
    expect(result.colors).toEqual(['#ffffff', '#2f6bff', '#101828'])
    expect(extract).not.toHaveBeenCalled()
  })

  it('falls back to quantize when neither detector finds enough', async () => {
    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.source).toBe('quantize')
    expect(result.colors).toEqual(['#15181c', '#757a8a'])
    expect(result.degraded).toBe(true)
    expect(extract).toHaveBeenCalledWith(SOURCE)
  })

  it('rethrows a quantize failure', async () => {
    vi.mocked(extract).mockRejectedValue(new Error('No colors'))

    await expect(
      readPalette(SOURCE, { sourceImageId: SOURCE_IMAGE_ID }),
    ).rejects.toThrow('No colors')
  })

  it('continues with ocrUnavailable when the engine cannot load', async () => {
    vi.mocked(detectSwatchBlobs).mockReturnValue([
      CARD,
      blobCandidate('#2f6bff', 900),
      blobCandidate('#101828', 800),
    ])
    vi.mocked(ocrHexCodes).mockRejectedValue(new OcrUnavailableError())

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.ocrUnavailable).toBe(true)
    expect(result.source).toBe('blobs')
  })

  it('tags every candidate with the detector that produced it', async () => {
    vi.mocked(detectSwatchBlobs).mockReturnValue([
      CARD,
      blobCandidate('#2f6bff', 900),
    ])
    vi.mocked(ocrHexCodes).mockResolvedValue([hexCandidate('#101828')])

    const { candidates } = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(candidates).toEqual([
      { hex: '#101828', source: 'ocr', confidence: 90, repaired: false },
      { hex: '#ffffff', source: 'blobs', area: CARD.area },
      { hex: '#2f6bff', source: 'blobs', area: 900 },
      { hex: '#15181c', source: 'quantize' },
      { hex: '#757a8a', source: 'quantize' },
    ])
  })
})

describe('readPalette crop handling', () => {
  it('crops to the stored rect when it belongs to the source image', async () => {
    const crop = { imageId: SOURCE_IMAGE_ID, x: 0.36, y: 0.43, w: 0.15, h: 0.3 }
    vi.mocked(ocrHexCodes).mockResolvedValue([
      hexCandidate('#101828'),
      hexCandidate('#2f6bff'),
      hexCandidate('#475467'),
    ])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
      crop,
    })

    expect(cropToBlob).toHaveBeenNthCalledWith(1, SOURCE, crop)
    expect(cropToBlob).toHaveBeenNthCalledWith(
      2,
      SOURCE,
      rightColumn(crop),
      COLUMN_PASS_OPTIONS,
    )
    expect(downscaleForOcr).not.toHaveBeenCalled()
    expect(result.autoCrop).toBeUndefined()
  })

  it('ignores a crop left over from another source image', async () => {
    const stale = { imageId: 'img_00', x: 0.1, y: 0.1, w: 0.4, h: 0.4 }
    vi.mocked(detectSwatchBlobs).mockReturnValue([])

    await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
      crop: stale,
    })

    expect(cropToBlob).not.toHaveBeenCalled()
    expect(downscaleForOcr).toHaveBeenCalledWith(SOURCE)
  })

  it('derives a crop from the largest blob clear of every edge', async () => {
    vi.mocked(detectSwatchBlobs).mockReturnValue([
      blobCandidate('#e8ecef', 240 * 200, { x0: 0, y0: 0, x1: 240, y1: 200 }),
      CARD,
      blobCandidate('#2f6bff', 900),
    ])
    vi.mocked(ocrHexCodes).mockResolvedValue([
      hexCandidate('#101828'),
      hexCandidate('#2f6bff'),
      hexCandidate('#475467'),
    ])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(cropToBlob).toHaveBeenNthCalledWith(
      1,
      SOURCE,
      CARD_CROP,
      CARD_PASS_OPTIONS,
    )
    expect(result.autoCrop).toEqual(CARD_CROP)
  })

  it('skips OCR when no region is card-like enough to crop', async () => {
    // 500 px of a 240×240 buffer is 0.87 %, under the 1.5 % candidate floor.
    vi.mocked(detectSwatchBlobs).mockReturnValue([
      blobCandidate('#2f6bff', 500),
      blobCandidate('#e8ecef', 240 * 200, { x0: 0, y0: 0, x1: 240, y1: 200 }),
    ])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(ocrHexCodes).not.toHaveBeenCalled()
    expect(cropToBlob).not.toHaveBeenCalled()
    expect(result.autoCrop).toBeUndefined()
    expect(result.source).toBe('quantize')
  })
})

describe('readPalette auto-crop selection', () => {
  const RICH_CARD = blobCandidate('#f3f7fb', 1800, {
    x0: 40,
    y0: 40,
    x1: 100,
    y1: 100,
  })
  const BIG_PANEL = blobCandidate('#212328', 3600, {
    x0: 120,
    y0: 40,
    x1: 200,
    y1: 120,
  })
  const CHIPS = [
    blobCandidate('#5687ff', 60, { x0: 45, y0: 45, x1: 55, y1: 55 }),
    blobCandidate('#ff5722', 60, { x0: 60, y0: 45, x1: 70, y1: 55 }),
    blobCandidate('#22c55e', 60, { x0: 75, y0: 45, x1: 85, y1: 55 }),
  ]

  it('prefers the smaller region that actually contains swatches', async () => {
    mockBlobPasses(
      [BIG_PANEL, RICH_CARD],
      [BIG_PANEL, RICH_CARD, ...CHIPS],
    )

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.autoCrop).toEqual(
      cropOf(RICH_CARD.bbox, BUFFER_EDGE, BUFFER_EDGE),
    )
  })

  it('skips OCR when every non-edge region is under 1.5 %', async () => {
    // 800 px of 57 600 is 1.39 % — just under the floor, chips or not.
    const tinyCard = blobCandidate('#f3f7fb', 800, {
      x0: 40,
      y0: 40,
      x1: 70,
      y1: 70,
    })
    mockBlobPasses([tinyCard], [tinyCard, ...CHIPS])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.autoCrop).toBeUndefined()
    expect(ocrHexCodes).not.toHaveBeenCalled()
    expect(cropToBlob).not.toHaveBeenCalled()
  })

  it('breaks a containment tie on area', async () => {
    const smallCard = blobCandidate('#f3f7fb', 1000, {
      x0: 40,
      y0: 40,
      x1: 90,
      y1: 90,
    })
    const largeCard = blobCandidate('#e8ecef', 3000, {
      x0: 120,
      y0: 40,
      x1: 180,
      y1: 120,
    })
    mockBlobPasses(
      [largeCard, smallCard],
      [
        largeCard,
        smallCard,
        blobCandidate('#5687ff', 60, { x0: 45, y0: 45, x1: 55, y1: 55 }),
        blobCandidate('#ff5722', 60, { x0: 125, y0: 45, x1: 135, y1: 55 }),
      ],
    )

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.autoCrop).toEqual(
      cropOf(largeCard.bbox, BUFFER_EDGE, BUFFER_EDGE),
    )
  })

  it('falls back to the largest non-edge region when no chips are found', async () => {
    mockBlobPasses([BIG_PANEL, RICH_CARD], [BIG_PANEL, RICH_CARD])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.autoCrop).toEqual(
      cropOf(BIG_PANEL.bbox, BUFFER_EDGE, BUFFER_EDGE),
    )
  })
})

describe('readPalette OCR pass union', () => {
  it('stops after the first pass when it already read five exact codes', async () => {
    vi.mocked(ocrHexCodes).mockResolvedValue(fiveExactCodes())

    await readPalette(SOURCE, { sourceImageId: SOURCE_IMAGE_ID })

    expect(ocrHexCodes).toHaveBeenCalledTimes(1)
    expect(cropToBlob).toHaveBeenCalledTimes(1)
  })

  it('does not let repaired codes satisfy the early stop', async () => {
    vi.mocked(ocrHexCodes).mockResolvedValue([
      hexCandidate('#101828'),
      hexCandidate('#2f6bff'),
      hexCandidate('#475467'),
      hexCandidate('#d0d5dd', true),
      hexCandidate('#ffffff', true),
    ])

    await readPalette(SOURCE, { sourceImageId: SOURCE_IMAGE_ID })

    expect(ocrHexCodes).toHaveBeenCalledTimes(2)
  })

  it('runs the right-column pass when the card pass came up short', async () => {
    vi.mocked(ocrHexCodes)
      .mockResolvedValueOnce([
        hexCandidate('#101828'),
        hexCandidate('#2f6bff'),
      ])
      .mockResolvedValueOnce([
        hexCandidate('#101828'),
        hexCandidate('#d0d5dd'),
      ])

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(ocrHexCodes).toHaveBeenCalledTimes(2)
    expect(cropToBlob).toHaveBeenNthCalledWith(
      2,
      SOURCE,
      rightColumn(CARD_CROP),
      COLUMN_PASS_OPTIONS,
    )
    expect(result.source).toBe('ocr')
    expect(result.colors).toEqual(['#101828', '#2f6bff', '#d0d5dd'])
  })

  it('keeps the more confident read of a hex both passes saw', async () => {
    vi.mocked(ocrHexCodes)
      .mockResolvedValueOnce([
        { hex: '#d0d5dd', confidence: 41, repaired: true },
        hexCandidate('#101828'),
      ])
      .mockResolvedValueOnce([
        { hex: '#d0d5dd', confidence: 88, repaired: false },
        hexCandidate('#2f6bff'),
      ])

    const { candidates } = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(
      candidates.filter((candidate) => candidate.source === 'ocr'),
    ).toEqual([
      { hex: '#d0d5dd', source: 'ocr', confidence: 88, repaired: false },
      { hex: '#101828', source: 'ocr', confidence: 90, repaired: false },
      { hex: '#2f6bff', source: 'ocr', confidence: 90, repaired: false },
    ])
  })

  it('spans the recognizing fraction across the passes it runs', async () => {
    const fractions: number[] = []
    vi.mocked(ocrHexCodes).mockImplementation(async (_input, options) => {
      const onProgress = options?.onProgress
      onProgress?.({ phase: 'recognizing', fraction: 0 })
      onProgress?.({ phase: 'recognizing', fraction: 1 })
      return []
    })

    await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
      onProgress: ({ phase, fraction }) => {
        if (phase === 'recognizing' && fraction !== undefined) {
          fractions.push(fraction)
        }
      },
    })

    expect(fractions).toEqual([0, 0.5, 0.5, 1])
  })
})

describe('readPalette cancellation', () => {
  it('rejects before any detector runs when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      readPalette(SOURCE, {
        sourceImageId: SOURCE_IMAGE_ID,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ReadCancelledError)
    expect(downscaleForOcr).not.toHaveBeenCalled()
  })

  it('rejects between phases and runs no later detector', async () => {
    const controller = new AbortController()
    vi.mocked(downscaleForOcr).mockImplementation(() => {
      controller.abort()
      return Promise.resolve(SOURCE)
    })

    await expect(
      readPalette(SOURCE, {
        sourceImageId: SOURCE_IMAGE_ID,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ReadCancelledError)
    expect(downsample).not.toHaveBeenCalled()
    expect(detectSwatchBlobs).not.toHaveBeenCalled()
    expect(ocrHexCodes).not.toHaveBeenCalled()
    expect(extract).not.toHaveBeenCalled()
  })
})

describe('readPalette auto-crop on a synthetic screenshot', () => {
  const FIXTURE_WIDTH = 240
  const FIXTURE_HEIGHT = 156
  /** Where the palette card lands on the real dopely fixture, downsampled. */
  const CARD_BBOX = { x0: 88, y0: 67, x1: 123, y1: 112 }
  /** Bigger than the card, so only containment can pick the card. */
  const PANEL_BBOX = { x0: 124, y0: 40, x1: 200, y1: 120 }
  const CHIP_COLORS: [number, number, number][] = [
    [86, 135, 255],
    [255, 87, 34],
    [34, 197, 94],
    [234, 179, 8],
    [168, 85, 247],
  ]

  function fillRect(
    data: Uint8ClampedArray,
    width: number,
    bbox: BlobCandidate['bbox'],
    [r, g, b]: [number, number, number],
  ): void {
    for (let y = bbox.y0; y < bbox.y1; y += 1) {
      for (let x = bbox.x0; x < bbox.x1; x += 1) {
        const offset = (y * width + x) * 4
        data[offset] = r
        data[offset + 1] = g
        data[offset + 2] = b
        data[offset + 3] = 255
      }
    }
  }

  function screenshotBuffer(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(FIXTURE_WIDTH * FIXTURE_HEIGHT * 4)

    fillRect(
      data,
      FIXTURE_WIDTH,
      { x0: 0, y0: 0, x1: FIXTURE_WIDTH, y1: FIXTURE_HEIGHT },
      [11, 11, 12],
    )
    fillRect(data, FIXTURE_WIDTH, CARD_BBOX, [243, 247, 251])
    fillRect(data, FIXTURE_WIDTH, PANEL_BBOX, [33, 35, 40])

    CHIP_COLORS.forEach((color, index) => {
      const x0 = 90 + index * 6
      fillRect(
        data,
        FIXTURE_WIDTH,
        { x0, y0: 72, x1: x0 + 5, y1: 77 },
        color,
      )
    })

    return data
  }

  beforeEach(async () => {
    const actual =
      await vi.importActual<typeof import('./swatchBlobs')>('./swatchBlobs')

    vi.mocked(detectSwatchBlobs).mockImplementation(actual.detectSwatchBlobs)
    vi.mocked(downsample).mockResolvedValue({
      data: screenshotBuffer(),
      width: FIXTURE_WIDTH,
      height: FIXTURE_HEIGHT,
    })
    vi.mocked(ocrHexCodes).mockResolvedValue([
      hexCandidate('#5687ff'),
      hexCandidate('#ff5722'),
      hexCandidate('#22c55e'),
    ])
  })

  it('crops to the chip-bearing card, not the larger empty panel', async () => {
    const expected = cropOf(CARD_BBOX, FIXTURE_WIDTH, FIXTURE_HEIGHT)

    const result = await readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
    })

    expect(result.autoCrop).toEqual(expected)
    expect(cropToBlob).toHaveBeenNthCalledWith(
      1,
      SOURCE,
      expected,
      CARD_PASS_OPTIONS,
    )
    expect(cropToBlob).toHaveBeenNthCalledWith(
      2,
      SOURCE,
      rightColumn(expected),
      COLUMN_PASS_OPTIONS,
    )
    expect(result.source).toBe('ocr')
  })
})

describe('readPalette blob coordinate space', () => {
  const MIA_CROP = { imageId: SOURCE_IMAGE_ID, x: 0.2, y: 0.2, w: 0.6, h: 0.6 }
  /** A chip in the detector's 240 px space: the left eighth of the crop. */
  const CHIP = blobCandidate('#5687ff', 576, { x0: 24, y0: 24, x1: 48, y1: 48 })

  function word(text: string, x0: number, y0: number): OcrWord {
    return { text, confidence: 90, bbox: { x0, y0, x1: x0 + 70, y1: y0 + 12 } }
  }

  /**
   * Positions are the card pass's own 1200 px pixels: the near code sits a few
   * pixels off the chip once the chip is mapped there, the far one is half a
   * page away. Unmapped, the chip would still be at x1 = 48 and neither passes.
   */
  const WORDS = [
    word('2f6bff', 250, 200),
    word('101828', 900, 900),
    word('#475467', 250, 300),
    word('#d0d5dd', 250, 340),
  ]

  function readWithWords() {
    vi.mocked(detectSwatchBlobs).mockReturnValue([CHIP])
    vi.mocked(ocrHexCodes).mockImplementationOnce(async (_input, options) =>
      parseHexTokens(WORDS, options?.blobs),
    )

    return readPalette(SOURCE, {
      sourceImageId: SOURCE_IMAGE_ID,
      crop: MIA_CROP,
    })
  }

  it('accepts a bare code beside a mapped chip and rejects a distant one', async () => {
    const result = await readWithWords()

    expect(result.source).toBe('ocr')
    expect(result.colors).toEqual(['#2f6bff', '#475467', '#d0d5dd'])
    expect(result.colors).not.toContain('#101828')
  })

  it('hands each pass the chips that pass can see, in that pass pixels', async () => {
    await readWithWords()

    expect(vi.mocked(ocrHexCodes).mock.calls[0][1]?.blobs).toEqual([
      { ...CHIP, bbox: { x0: 120, y0: 120, x1: 240, y1: 240 } },
    ])
    expect(vi.mocked(ocrHexCodes).mock.calls[1][1]?.blobs).toEqual([])
  })
})
