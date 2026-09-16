export interface ContainRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ContainClickInput {
  clientX: number
  clientY: number
  rect: ContainRect
  intrinsicW: number
  intrinsicH: number
}

export interface NormalizedPoint {
  nx: number
  ny: number
}

export function mapContainClick({
  clientX,
  clientY,
  rect,
  intrinsicW,
  intrinsicH,
}: ContainClickInput): NormalizedPoint | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    intrinsicW <= 0 ||
    intrinsicH <= 0
  ) {
    return null
  }

  const scale = Math.min(rect.width / intrinsicW, rect.height / intrinsicH)
  const contentWidth = intrinsicW * scale
  const contentHeight = intrinsicH * scale
  const contentLeft = rect.left + (rect.width - contentWidth) / 2
  const contentTop = rect.top + (rect.height - contentHeight) / 2
  const contentRight = contentLeft + contentWidth
  const contentBottom = contentTop + contentHeight

  if (
    clientX < contentLeft ||
    clientX > contentRight ||
    clientY < contentTop ||
    clientY > contentBottom
  ) {
    return null
  }

  return {
    nx: Math.max(0, Math.min(1, (clientX - contentLeft) / contentWidth)),
    ny: Math.max(0, Math.min(1, (clientY - contentTop) / contentHeight)),
  }
}
