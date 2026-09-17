/**
 * CropTool — draw, move and resize a normalized crop rectangle over the source
 * screenshot (plan §8).
 *
 * The image renders `object-contain`, so the visible pixels occupy a
 * letterboxed *content box* inside the element. `mapContainClick` owns that
 * geometry for pointer input; the overlay measures the same box off the image
 * element instead of assuming it fills the wrapper, so mask, outline and
 * handles stay glued to the image at any container size. Drags keep a local
 * draft and only call `onChange` on pointerup — the owner persists crops, and a
 * write per pointermove would thrash it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Button } from '../../../components/Button'
import type { NormalizedRect } from '../../../types'
import { mapContainClick } from '../containMap'
import type { ContainRect } from '../containMap'
import {
  MIN_CROP_EDGE,
  clampRect,
  isUsableRect,
  nudgeRect,
  rectFromPoints,
} from './cropRect'
import type { RectPoint } from './cropRect'

export interface CropToolProps {
  imageUrl: string
  intrinsic: { width: number; height: number }
  value: NormalizedRect | null
  onChange: (rect: NormalizedRect | null) => void
  onConfirm: () => void
  onCancel: () => void
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

interface ContentBox {
  left: number
  top: number
  width: number
  height: number
}

type Drag =
  | { kind: 'new'; pointerId: number; origin: RectPoint }
  | { kind: 'move'; pointerId: number; origin: RectPoint; start: NormalizedRect }
  | { kind: 'resize'; pointerId: number; anchor: RectPoint }

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

const OPPOSITE: Record<Corner, Corner> = {
  nw: 'se',
  ne: 'sw',
  sw: 'ne',
  se: 'nw',
}

const CORNER_CURSOR: Record<Corner, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
}

const ARROW_DELTA: Record<string, RectPoint> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

const NUDGE_STEP = 0.01
const NUDGE_STEP_SHIFT = 0.05
/** A press-and-release with no travel is a click, not a zero-area crop. */
const CLICK_EPSILON = 1e-6

function pct(value: number): number {
  return Math.round(value * 100)
}

function px(value: number): string {
  return `${value}px`
}

/** The `object-contain` content box inside `rect`, in the same coordinate space. */
function contentBoxIn(
  rect: ContainRect,
  intrinsicW: number,
  intrinsicH: number,
): ContentBox | null {
  if (rect.width <= 0 || rect.height <= 0 || intrinsicW <= 0 || intrinsicH <= 0) {
    return null
  }

  const scale = Math.min(rect.width / intrinsicW, rect.height / intrinsicH)
  const width = intrinsicW * scale
  const height = intrinsicH * scale

  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

function sameBox(left: ContentBox | null, right: ContentBox | null): boolean {
  if (!left || !right) return left === right

  return (
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height
  )
}

function cornerOf(rect: NormalizedRect, corner: Corner): RectPoint {
  return {
    x: corner === 'nw' || corner === 'sw' ? rect.x : rect.x + rect.w,
    y: corner === 'nw' || corner === 'ne' ? rect.y : rect.y + rect.h,
  }
}

function containsPoint(rect: NormalizedRect, point: RectPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  )
}

function capturePointer(element: Element, pointerId: number): void {
  if (typeof element.setPointerCapture !== 'function') return
  element.setPointerCapture(pointerId)
}

function releasePointer(element: Element, pointerId: number): void {
  if (typeof element.releasePointerCapture !== 'function') return
  element.releasePointerCapture(pointerId)
}

export function CropTool({
  imageUrl,
  intrinsic,
  value,
  onChange,
  onConfirm,
  onCancel,
}: CropToolProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [box, setBox] = useState<ContentBox | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<NormalizedRect | null>(null)

  const intrinsicW = intrinsic.width
  const intrinsicH = intrinsic.height

  const measure = useCallback(() => {
    const image = imageRef.current
    const wrapper = wrapperRef.current
    if (!image || !wrapper) return

    const wrapperRect = wrapper.getBoundingClientRect()
    const content = contentBoxIn(
      image.getBoundingClientRect(),
      intrinsicW,
      intrinsicH,
    )
    const next: ContentBox | null = content
      ? {
          left: content.left - wrapperRect.left,
          top: content.top - wrapperRect.top,
          width: content.width,
          height: content.height,
        }
      : null

    setBox((previous) => (sameBox(previous, next) ? previous : next))
  }, [intrinsicW, intrinsicH])

  useLayoutEffect(() => {
    measure()
  }, [measure, imageUrl])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  /** Normalized point, or null when the pointer is in the letterbox gutter. */
  function exactPoint(clientX: number, clientY: number): RectPoint | null {
    const image = imageRef.current
    if (!image) return null

    const point = mapContainClick({
      clientX,
      clientY,
      rect: image.getBoundingClientRect(),
      intrinsicW,
      intrinsicH,
    })

    return point ? { x: point.nx, y: point.ny } : null
  }

  /** Same mapping, but a pointer outside the content box slides onto its edge. */
  function clampedPoint(clientX: number, clientY: number): RectPoint | null {
    const image = imageRef.current
    if (!image) return null

    const rect = image.getBoundingClientRect()
    const content = contentBoxIn(rect, intrinsicW, intrinsicH)
    if (!content) return null

    const point = mapContainClick({
      clientX: Math.min(Math.max(clientX, content.left), content.left + content.width),
      clientY: Math.min(Math.max(clientY, content.top), content.top + content.height),
      rect,
      intrinsicW,
      intrinsicH,
    })

    return point ? { x: point.nx, y: point.ny } : null
  }

  const shown = drag ? draft : value

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return

    const corner = (event.target as HTMLElement).dataset?.corner as
      | Corner
      | undefined

    if (corner && value) {
      setDrag({
        kind: 'resize',
        pointerId: event.pointerId,
        anchor: cornerOf(value, OPPOSITE[corner]),
      })
      setDraft(value)
      capturePointer(event.currentTarget, event.pointerId)
      return
    }

    const origin = exactPoint(event.clientX, event.clientY)
    if (!origin) return

    if (value && containsPoint(value, origin)) {
      setDrag({ kind: 'move', pointerId: event.pointerId, origin, start: value })
      setDraft(value)
    } else {
      setDrag({ kind: 'new', pointerId: event.pointerId, origin })
      setDraft(rectFromPoints(origin, origin))
    }

    capturePointer(event.currentTarget, event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    const point = clampedPoint(event.clientX, event.clientY)
    if (!point) return

    if (drag.kind === 'resize') {
      setDraft(rectFromPoints(drag.anchor, point))
      return
    }
    if (drag.kind === 'move') {
      setDraft(
        nudgeRect(drag.start, point.x - drag.origin.x, point.y - drag.origin.y),
      )
      return
    }

    setDraft(rectFromPoints(drag.origin, point))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return

    releasePointer(event.currentTarget, event.pointerId)

    const settled = draft ? clampRect(draft) : null
    setDrag(null)
    setDraft(null)

    if (!settled) return
    if (
      drag.kind === 'new' &&
      settled.w < CLICK_EPSILON &&
      settled.h < CLICK_EPSILON
    ) {
      onChange(null)
      return
    }

    onChange(settled)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (value && isUsableRect(value)) onConfirm()
      return
    }

    const delta = ARROW_DELTA[event.key]
    if (!delta || !value) return

    event.preventDefault()
    const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP
    onChange(nudgeRect(value, delta.x * step, delta.y * step))
  }

  const usable = value !== null && isUsableRect(value)
  const tooSmall =
    value !== null && (value.w < MIN_CROP_EDGE || value.h < MIN_CROP_EDGE)

  const announcement = value
    ? `Crop ${pct(value.x)}% left, ${pct(value.y)}% top, ${pct(value.w)}% wide, ${pct(value.h)}% tall`
    : 'No crop selected'

  const geometry =
    box && shown
      ? {
          left: box.left + shown.x * box.width,
          top: box.top + shown.y * box.height,
          width: shown.w * box.width,
          height: shown.h * box.height,
        }
      : null

  return (
    <div className="flex flex-col gap-3">
      <p className="label-mono text-chrome-500">
        drag on the image to set the crop
      </p>

      <div ref={wrapperRef} className="relative">
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Source screenshot — drag to set the crop area"
          onLoad={measure}
          className="max-h-80 w-full object-contain"
        />

        <div
          role="group"
          tabIndex={0}
          aria-label="Crop region"
          aria-describedby="crop-tool-live"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 touch-none cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {box && geometry && shown && (
            <>
              <div
                className="pointer-events-none absolute bg-chrome-900/60"
                style={{
                  left: px(box.left),
                  top: px(box.top),
                  width: px(box.width),
                  height: px(geometry.top - box.top),
                }}
              />
              <div
                className="pointer-events-none absolute bg-chrome-900/60"
                style={{
                  left: px(box.left),
                  top: px(geometry.top + geometry.height),
                  width: px(box.width),
                  height: px(box.top + box.height - geometry.top - geometry.height),
                }}
              />
              <div
                className="pointer-events-none absolute bg-chrome-900/60"
                style={{
                  left: px(box.left),
                  top: px(geometry.top),
                  width: px(geometry.left - box.left),
                  height: px(geometry.height),
                }}
              />
              <div
                className="pointer-events-none absolute bg-chrome-900/60"
                style={{
                  left: px(geometry.left + geometry.width),
                  top: px(geometry.top),
                  width: px(box.left + box.width - geometry.left - geometry.width),
                  height: px(geometry.height),
                }}
              />

              <div
                className="wire pointer-events-none absolute cursor-move"
                style={{
                  left: px(geometry.left),
                  top: px(geometry.top),
                  width: px(geometry.width),
                  height: px(geometry.height),
                }}
              />

              <span
                className="label-mono pointer-events-none absolute -translate-y-full whitespace-nowrap rounded-block bg-chrome-900 px-1 py-0.5 text-chrome-0"
                style={{ left: px(geometry.left), top: px(geometry.top) }}
              >
                {pct(shown.x)}% {pct(shown.y)}% {pct(shown.w)}% {pct(shown.h)}%
              </span>

              {CORNERS.map((corner) => {
                const point = cornerOf(shown, corner)

                return (
                  <span
                    key={corner}
                    data-corner={corner}
                    aria-hidden="true"
                    className={`absolute -ml-2 -mt-2 block h-4 w-4 rounded-block border border-chrome-600 bg-chrome-0 ${CORNER_CURSOR[corner]}`}
                    style={{
                      left: px(box.left + point.x * box.width),
                      top: px(box.top + point.y * box.height),
                    }}
                  />
                )
              })}
            </>
          )}
        </div>
      </div>

      {tooSmall && (
        <p role="alert" className="text-xs text-accent">
          Crop is too small — drag a larger area
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!usable} onClick={onConfirm}>
          Use crop
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onChange(null)}>
          Clear crop
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <p id="crop-tool-live" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
