import { describe, expect, it } from 'vitest'
import {
  MIN_CROP_EDGE,
  clampRect,
  isUsableRect,
  nudgeRect,
  rectFromPoints,
} from './cropRect'

describe('crop rectangle helpers', () => {
  it('clamps every edge to the normalized image bounds', () => {
    expect(clampRect({ x: -0.25, y: 0.75, w: 0.75, h: 0.5 })).toEqual({
      x: 0,
      y: 0.75,
      w: 0.5,
      h: 0.25,
    })
  })

  it('normalizes points regardless of drag direction', () => {
    expect(rectFromPoints({ x: 0.75, y: 0.75 }, { x: 0.25, y: 0.25 })).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    })
  })

  it('nudges without changing size or leaving the image', () => {
    expect(nudgeRect({ x: 0.75, y: 0.1, w: 0.25, h: 0.3 }, 0.1, -0.2)).toEqual(
      {
        x: 0.75,
        y: 0,
        w: 0.25,
        h: 0.3,
      },
    )
  })

  it('requires both edges to meet the minimum crop size', () => {
    expect(
      isUsableRect({ x: 0, y: 0, w: MIN_CROP_EDGE, h: MIN_CROP_EDGE }),
    ).toBe(true)
    expect(
      isUsableRect({
        x: 0,
        y: 0,
        w: MIN_CROP_EDGE - 0.001,
        h: MIN_CROP_EDGE,
      }),
    ).toBe(false)
    expect(isUsableRect({ x: 0.9, y: 0, w: 0.2, h: 0.2 })).toBe(false)
  })
})
