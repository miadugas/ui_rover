import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedRect } from '../../../types'
import { CropTool } from './CropTool'
import type { CropToolProps } from './CropTool'

/**
 * jsdom implements neither pointer capture nor layout. The capture calls are
 * no-ops here (events are dispatched straight at the overlay), and the image
 * box is mocked so `mapContainClick` has real geometry to map through.
 *
 * Box: 200x200 element, 200x100 intrinsic → contain scale 1, so the content box
 * is x 0..200, y 50..150. Everything above y=50 / below y=150 is letterbox.
 */
const INTRINSIC = { width: 200, height: 100 }

const IMAGE_BOX = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 200,
  bottom: 200,
  width: 200,
  height: 200,
  toJSON: () => ({}),
} as DOMRect

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  const element = Element.prototype as Element & {
    setPointerCapture: (pointerId: number) => void
    releasePointerCapture: (pointerId: number) => void
  }
  element.setPointerCapture = () => {}
  element.releasePointerCapture = () => {}

  vi.spyOn(HTMLImageElement.prototype, 'getBoundingClientRect').mockReturnValue(
    IMAGE_BOX,
  )
})

function renderTool(overrides: Partial<CropToolProps> = {}) {
  const onChange = vi.fn()
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  render(
    <CropTool
      imageUrl="blob:source"
      intrinsic={INTRINSIC}
      value={null}
      onChange={onChange}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )

  return {
    onChange,
    onConfirm,
    onCancel,
    overlay: screen.getByRole('group', { name: 'Crop region' }),
  }
}

function expectRect(actual: unknown, expected: NormalizedRect) {
  const rect = actual as NormalizedRect
  expect(rect.x).toBeCloseTo(expected.x, 5)
  expect(rect.y).toBeCloseTo(expected.y, 5)
  expect(rect.w).toBeCloseTo(expected.w, 5)
  expect(rect.h).toBeCloseTo(expected.h, 5)
}

describe('CropTool', () => {
  it('turns a pointer drag into a normalized rect on pointerup only', () => {
    const { onChange, overlay } = renderTool()

    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 20, clientY: 60 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 120, clientY: 110 })

    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 120, clientY: 110 })

    expect(onChange).toHaveBeenCalledTimes(1)
    expectRect(onChange.mock.calls[0][0], { x: 0.1, y: 0.1, w: 0.5, h: 0.5 })
  })

  it('shows the live percentage label while dragging', () => {
    const { overlay } = renderTool()

    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 20, clientY: 60 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 120, clientY: 110 })

    expect(screen.getByText('10% 10% 50% 50%')).toBeInTheDocument()
  })

  it('clamps a drag that leaves the content box', () => {
    const { onChange, overlay } = renderTool()

    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 20, clientY: 60 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 900, clientY: 900 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 900, clientY: 900 })

    expectRect(onChange.mock.calls[0][0], { x: 0.1, y: 0.1, w: 0.9, h: 0.9 })
  })

  it('ignores a drag that starts in the letterbox gutter', () => {
    const { onChange, overlay } = renderTool()

    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 20, clientY: 10 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 120, clientY: 110 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 120, clientY: 110 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves the rect when the drag starts inside it', () => {
    const value: NormalizedRect = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 }
    const { onChange, overlay } = renderTool({ value })

    fireEvent.pointerDown(overlay, { pointerId: 1, button: 0, clientX: 40, clientY: 70 })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 60, clientY: 80 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 60, clientY: 80 })

    expectRect(onChange.mock.calls[0][0], { x: 0.2, y: 0.2, w: 0.4, h: 0.4 })
  })

  it('nudges by 1% with an arrow key and 5% with shift', () => {
    const value: NormalizedRect = { x: 0.1, y: 0.2, w: 0.4, h: 0.4 }
    const { onChange, overlay } = renderTool({ value })

    fireEvent.keyDown(overlay, { key: 'ArrowRight' })
    expectRect(onChange.mock.calls[0][0], { x: 0.11, y: 0.2, w: 0.4, h: 0.4 })

    fireEvent.keyDown(overlay, { key: 'ArrowUp', shiftKey: true })
    expectRect(onChange.mock.calls[1][0], { x: 0.1, y: 0.15, w: 0.4, h: 0.4 })
  })

  it('confirms on Enter only when the rect is usable', () => {
    const tiny = renderTool({ value: { x: 0.1, y: 0.1, w: 0.01, h: 0.01 } })
    fireEvent.keyDown(tiny.overlay, { key: 'Enter' })
    expect(tiny.onConfirm).not.toHaveBeenCalled()

    cleanup()

    const usable = renderTool({ value: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } })
    fireEvent.keyDown(usable.overlay, { key: 'Enter' })
    expect(usable.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', () => {
    const { onCancel, overlay } = renderTool({
      value: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
    })

    fireEvent.keyDown(overlay, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables "Use crop" below the minimum edge and hints why', () => {
    renderTool({ value: { x: 0.1, y: 0.1, w: 0.01, h: 0.01 } })

    expect(screen.getByRole('button', { name: 'Use crop' })).toBeDisabled()
    expect(
      screen.getByText('Crop is too small — drag a larger area'),
    ).toBeInTheDocument()
  })

  it('clears the crop', () => {
    const { onChange } = renderTool({ value: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } })

    fireEvent.click(screen.getByRole('button', { name: 'Clear crop' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('announces the rect in percentages through the live region', () => {
    const { rerender } = render(
      <CropTool
        imageUrl="blob:source"
        intrinsic={INTRINSIC}
        value={null}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('No crop selected')

    rerender(
      <CropTool
        imageUrl="blob:source"
        intrinsic={INTRINSIC}
        value={{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Crop 10% left, 20% top, 30% wide, 40% tall',
    )
  })
})
