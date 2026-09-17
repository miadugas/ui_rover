import { describe, expect, it } from 'vitest'
import { mapBlobsIntoPass, passPixelHeight } from './blobSpace'
import type { BlobCandidate } from './swatchBlobs'

const DETECTOR_WIDTH = 240
const DETECTOR_HEIGHT = 240
const WHOLE_BASE = { x: 0, y: 0, w: 1, h: 1 }

function blob(bbox: BlobCandidate['bbox']): BlobCandidate {
  return { hex: '#2f6bff', area: 100, bbox }
}

describe('passPixelHeight', () => {
  it('keeps the sub-rect aspect of a square detector buffer', () => {
    expect(
      passPixelHeight(WHOLE_BASE, DETECTOR_WIDTH, DETECTOR_HEIGHT, 1200),
    ).toBe(1200)
  })

  it('grows the height when the sub-rect is a narrow column', () => {
    expect(
      passPixelHeight(
        { x: 0.55, y: 0, w: 0.45, h: 1 },
        DETECTOR_WIDTH,
        DETECTOR_HEIGHT,
        1000,
      ),
    ).toBeCloseTo(1000 / 0.45, 5)
  })

  it('reports no height for a zero-width rect', () => {
    expect(
      passPixelHeight(
        { x: 0, y: 0, w: 0, h: 1 },
        DETECTOR_WIDTH,
        DETECTOR_HEIGHT,
        1200,
      ),
    ).toBe(0)
  })
})

describe('mapBlobsIntoPass', () => {
  it('scales a whole-base blob into the pass pixels', () => {
    expect(
      mapBlobsIntoPass([blob({ x0: 24, y0: 48, x1: 48, y1: 72 })], {
        detectorWidth: DETECTOR_WIDTH,
        detectorHeight: DETECTOR_HEIGHT,
        rect: WHOLE_BASE,
        passWidth: 1200,
        passHeight: 1200,
      }),
    ).toEqual([
      { hex: '#2f6bff', area: 100, bbox: { x0: 120, y0: 240, x1: 240, y1: 360 } },
    ])
  })

  it('shifts and rescales for a sub-rect of the base', () => {
    const [mapped] = mapBlobsIntoPass(
      [blob({ x0: 144, y0: 0, x1: 168, y1: 24 })],
      {
        detectorWidth: DETECTOR_WIDTH,
        detectorHeight: DETECTOR_HEIGHT,
        rect: { x: 0.5, y: 0, w: 0.5, h: 1 },
        passWidth: 1000,
        passHeight: 2000,
      },
    )

    expect(mapped?.bbox.x0).toBeCloseTo(200, 5)
    expect(mapped?.bbox.y0).toBeCloseTo(0, 5)
    expect(mapped?.bbox.x1).toBeCloseTo(400, 5)
    expect(mapped?.bbox.y1).toBeCloseTo(200, 5)
  })

  it('drops blobs that fall entirely outside the sub-rect', () => {
    const inside = blob({ x0: 144, y0: 10, x1: 168, y1: 30 })
    const left = blob({ x0: 10, y0: 10, x1: 100, y1: 30 })
    const below = blob({ x0: 144, y0: 200, x1: 168, y1: 230 })

    expect(
      mapBlobsIntoPass([inside, left, below], {
        detectorWidth: DETECTOR_WIDTH,
        detectorHeight: DETECTOR_HEIGHT,
        rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        passWidth: 1000,
        passHeight: 1000,
      }).map((candidate) => Math.round(candidate.bbox.x0)),
    ).toEqual([200])
  })

  it('keeps a blob that only overlaps the sub-rect', () => {
    expect(
      mapBlobsIntoPass([blob({ x0: 100, y0: 10, x1: 140, y1: 30 })], {
        detectorWidth: DETECTOR_WIDTH,
        detectorHeight: DETECTOR_HEIGHT,
        rect: { x: 0.5, y: 0, w: 0.5, h: 1 },
        passWidth: 1000,
        passHeight: 1000,
      }),
    ).toHaveLength(1)
  })

  it('maps nothing when the detector buffer or the sub-rect is empty', () => {
    const space = {
      detectorWidth: DETECTOR_WIDTH,
      detectorHeight: DETECTOR_HEIGHT,
      rect: WHOLE_BASE,
      passWidth: 1200,
      passHeight: 1200,
    }

    expect(
      mapBlobsIntoPass([blob({ x0: 0, y0: 0, x1: 10, y1: 10 })], {
        ...space,
        detectorWidth: 0,
      }),
    ).toEqual([])
    expect(
      mapBlobsIntoPass([blob({ x0: 0, y0: 0, x1: 10, y1: 10 })], {
        ...space,
        rect: { x: 0, y: 0, w: 0, h: 1 },
      }),
    ).toEqual([])
  })
})
