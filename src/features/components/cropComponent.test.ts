import { describe, expect, it } from 'vitest'
import { pixelRect } from './cropComponent'

describe('pixelRect', () => {
  it('maps a full-image rect to the whole image', () => {
    expect(pixelRect({ x: 0, y: 0, w: 1, h: 1 }, 1200, 800)).toEqual({
      x: 0,
      y: 0,
      w: 1200,
      h: 800,
    })
  })

  it('rounds to whole pixels', () => {
    expect(pixelRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 101, 51)).toEqual({
      x: 25,
      y: 26,
      w: 51,
      h: 13,
    })
  })

  it('keeps a sub-pixel rect at least 1px on each edge', () => {
    expect(pixelRect({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, 400, 400)).toEqual({
      x: 200,
      y: 200,
      w: 1,
      h: 1,
    })
  })

  it('clamps an out-of-range rect inside the image', () => {
    expect(pixelRect({ x: -0.5, y: -0.5, w: 2, h: 2 }, 300, 200)).toEqual({
      x: 0,
      y: 0,
      w: 300,
      h: 200,
    })
  })

  it('clamps a rect that starts inside but runs past the edge', () => {
    expect(pixelRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 200, 100)).toEqual({
      x: 180,
      y: 90,
      w: 20,
      h: 10,
    })
  })

  it('never starts on the far edge of the image', () => {
    expect(pixelRect({ x: 1, y: 1, w: 1, h: 1 }, 50, 40)).toEqual({
      x: 49,
      y: 39,
      w: 1,
      h: 1,
    })
  })
})
