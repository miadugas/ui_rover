import { describe, expect, it } from 'vitest'
import { mapContainClick } from './containMap'

describe('mapContainClick', () => {
  it('maps a landscape image inside a portrait box', () => {
    const input = {
      rect: { left: 10, top: 20, width: 100, height: 200 },
      intrinsicW: 200,
      intrinsicH: 100,
    }

    expect(mapContainClick({ ...input, clientX: 60, clientY: 60 })).toBeNull()
    expect(mapContainClick({ ...input, clientX: 60, clientY: 120 })).toEqual({
      nx: 0.5,
      ny: 0.5,
    })
    expect(mapContainClick({ ...input, clientX: 10, clientY: 95 })).toEqual({
      nx: 0,
      ny: 0,
    })
    expect(mapContainClick({ ...input, clientX: 110, clientY: 145 })).toEqual({
      nx: 1,
      ny: 1,
    })
  })

  it('maps a portrait image inside a landscape box', () => {
    const input = {
      rect: { left: 20, top: 10, width: 200, height: 100 },
      intrinsicW: 100,
      intrinsicH: 200,
    }

    expect(mapContainClick({ ...input, clientX: 60, clientY: 60 })).toBeNull()
    expect(mapContainClick({ ...input, clientX: 120, clientY: 60 })).toEqual({
      nx: 0.5,
      ny: 0.5,
    })
    expect(mapContainClick({ ...input, clientX: 95, clientY: 10 })).toEqual({
      nx: 0,
      ny: 0,
    })
    expect(mapContainClick({ ...input, clientX: 145, clientY: 110 })).toEqual({
      nx: 1,
      ny: 1,
    })
  })
})
