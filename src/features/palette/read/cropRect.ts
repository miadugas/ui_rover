import type { NormalizedRect } from '../../../types'

export interface RectPoint {
  x: number
  y: number
}

export const MIN_CROP_EDGE = 0.05

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function clampRect(rect: NormalizedRect): NormalizedRect {
  if (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w >= 0 &&
    rect.h >= 0 &&
    rect.x + rect.w <= 1 &&
    rect.y + rect.h <= 1
  ) {
    return { ...rect }
  }

  const x = clampUnit(Math.min(rect.x, rect.x + rect.w))
  const y = clampUnit(Math.min(rect.y, rect.y + rect.h))
  const right = clampUnit(Math.max(rect.x, rect.x + rect.w))
  const bottom = clampUnit(Math.max(rect.y, rect.y + rect.h))

  return {
    x,
    y,
    w: right - x,
    h: bottom - y,
  }
}

export function rectFromPoints(
  first: RectPoint,
  second: RectPoint,
): NormalizedRect {
  const left = Math.min(first.x, second.x)
  const top = Math.min(first.y, second.y)
  const right = Math.max(first.x, second.x)
  const bottom = Math.max(first.y, second.y)

  return clampRect({
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  })
}

export function nudgeRect(
  rect: NormalizedRect,
  dx: number,
  dy: number,
): NormalizedRect {
  const clamped = clampRect(rect)

  return {
    ...clamped,
    x: Math.max(0, Math.min(1 - clamped.w, clamped.x + dx)),
    y: Math.max(0, Math.min(1 - clamped.h, clamped.y + dy)),
  }
}

export function isUsableRect(rect: NormalizedRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w >= MIN_CROP_EDGE &&
    rect.h >= MIN_CROP_EDGE &&
    rect.x + rect.w <= 1 &&
    rect.y + rect.h <= 1
  )
}
